import { NextRequest, NextResponse } from 'next/server';
import { portalDb } from '@/lib/portal/db';
import { readSessionToken, SESSION_COOKIE } from '@/lib/portal/session';
import { FACILITIES } from '@/lib/facilities';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Admin-only account management. There is no public signup path anywhere in
 * the app — accounts exist only because someone with an admin session created
 * them here.
 */
async function requireAdmin(req: NextRequest) {
  const session = await readSessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (!session) return null;

  // Role comes from the DB, not the cookie, so demoting an admin takes effect
  // straight away rather than at session expiry.
  const { data: user } = await portalDb
    .from('portal_users')
    .select('id, role, is_active')
    .eq('id', session.sub)
    .maybeSingle();

  if (!user || !user.is_active || user.role !== 'admin') return null;
  return user;
}

const DENIED = NextResponse.json({ error: 'Not authorised' }, { status: 403 });

/** List all accounts with their facility access. */
export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) return DENIED;

  const { data: users } = await portalDb
    .from('portal_users')
    .select('id, email, full_name, role, is_active, created_at, last_login_at')
    .order('created_at', { ascending: false });

  const { data: access } = await portalDb
    .from('portal_facility_access')
    .select('user_id, facility_slug');

  const byUser = new Map<string, string[]>();
  for (const row of access ?? []) {
    const list = byUser.get(row.user_id) ?? [];
    list.push(row.facility_slug);
    byUser.set(row.user_id, list);
  }

  return NextResponse.json({
    users: (users ?? []).map((u) => ({ ...u, facilities: byUser.get(u.id) ?? [] })),
    allFacilities: Object.entries(FACILITIES).map(([slug, f]) => ({ slug, name: f.name })),
  });
}

/** Create an account. */
export async function POST(req: NextRequest) {
  if (!(await requireAdmin(req))) return DENIED;

  const body = await req.json().catch(() => ({}));
  const email = String(body?.email ?? '').trim().toLowerCase();
  const fullName = String(body?.fullName ?? '').trim() || null;
  const role = body?.role === 'admin' ? 'admin' : 'partner';
  const facilities: string[] = Array.isArray(body?.facilities) ? body.facilities : [];

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'That email address looks invalid.' }, { status: 400 });
  }

  // Only slugs we actually know about.
  const validFacilities = facilities.filter((slug) => !!FACILITIES[slug]);

  if (role === 'partner' && validFacilities.length === 0) {
    return NextResponse.json(
      { error: 'Pick at least one facility for a partner account.' },
      { status: 400 },
    );
  }

  const { data: created, error } = await portalDb
    .from('portal_users')
    .insert({ email, full_name: fullName, role })
    .select('id')
    .single();

  if (error || !created) {
    const duplicate = error?.code === '23505';
    return NextResponse.json(
      { error: duplicate ? 'That email already has an account.' : 'Could not create the account.' },
      { status: duplicate ? 409 : 500 },
    );
  }

  if (validFacilities.length) {
    await portalDb.from('portal_facility_access').insert(
      validFacilities.map((slug) => ({ user_id: created.id, facility_slug: slug })),
    );
  }

  return NextResponse.json({ ok: true, id: created.id });
}

/** Update an account: activate/deactivate, change role, or reassign facilities. */
export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return DENIED;

  const body = await req.json().catch(() => ({}));
  const id = String(body?.id ?? '');
  if (!id) return NextResponse.json({ error: 'Missing account id.' }, { status: 400 });

  // Guard against locking yourself out of the admin portal.
  if (id === admin.id && (body?.isActive === false || body?.role === 'partner')) {
    return NextResponse.json(
      { error: "You can't deactivate or demote your own admin account." },
      { status: 400 },
    );
  }

  const patch: Record<string, unknown> = {};
  if (typeof body?.isActive === 'boolean') patch.is_active = body.isActive;
  if (body?.role === 'admin' || body?.role === 'partner') patch.role = body.role;
  if (typeof body?.fullName === 'string') patch.full_name = body.fullName.trim() || null;

  if (Object.keys(patch).length) {
    await portalDb.from('portal_users').update(patch).eq('id', id);
  }

  if (Array.isArray(body?.facilities)) {
    const validFacilities = (body.facilities as string[]).filter((slug) => !!FACILITIES[slug]);
    await portalDb.from('portal_facility_access').delete().eq('user_id', id);
    if (validFacilities.length) {
      await portalDb.from('portal_facility_access').insert(
        validFacilities.map((slug) => ({ user_id: id, facility_slug: slug })),
      );
    }
  }

  return NextResponse.json({ ok: true });
}

/** Delete an account outright. Deactivating is usually the better move. */
export async function DELETE(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return DENIED;

  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing account id.' }, { status: 400 });
  if (id === admin.id) {
    return NextResponse.json({ error: "You can't delete your own account." }, { status: 400 });
  }

  await portalDb.from('portal_users').delete().eq('id', id);
  return NextResponse.json({ ok: true });
}

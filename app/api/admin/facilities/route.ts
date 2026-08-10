import { NextRequest, NextResponse } from 'next/server';
import { portalDb } from '@/lib/portal/db';
import { listFacilities, slugify } from '@/lib/portal/facilities';
import { readSessionToken, SESSION_COOKIE } from '@/lib/portal/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function requireAdmin(req: NextRequest) {
  const session = await readSessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (!session) return null;

  const { data: user } = await portalDb
    .from('portal_users')
    .select('id, role, is_active')
    .eq('id', session.sub)
    .maybeSingle();

  if (!user || !user.is_active || user.role !== 'admin') return null;
  return user;
}

const DENIED = NextResponse.json({ error: 'Not authorised' }, { status: 403 });

/** List every facility, including deactivated ones. */
export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) return DENIED;

  const facilities = await listFacilities(true);

  // How many accounts are attached to each, so the UI can warn before removal.
  const { data: access } = await portalDb
    .from('portal_facility_access')
    .select('facility_slug');

  const counts = new Map<string, number>();
  for (const row of access ?? []) {
    counts.set(row.facility_slug, (counts.get(row.facility_slug) ?? 0) + 1);
  }

  return NextResponse.json({
    facilities: facilities.map((f) => ({ ...f, userCount: counts.get(f.slug) ?? 0 })),
  });
}

/** Add a facility. */
export async function POST(req: NextRequest) {
  if (!(await requireAdmin(req))) return DENIED;

  const body = await req.json().catch(() => ({}));
  const name = String(body?.name ?? '').trim();
  const slug = slugify(String(body?.slug ?? '').trim() || name);

  if (!name) {
    return NextResponse.json({ error: 'Facility name is required.' }, { status: 400 });
  }
  if (!slug) {
    return NextResponse.json(
      { error: 'That name produces an empty URL. Enter a slug manually.' },
      { status: 400 },
    );
  }

  const { error } = await portalDb.from('portal_facilities').insert({ slug, name });

  if (error) {
    const duplicate = error.code === '23505';
    return NextResponse.json(
      {
        error: duplicate
          ? `The URL "${slug}" is already taken by another facility.`
          : 'Could not add the facility.',
      },
      { status: duplicate ? 409 : 500 },
    );
  }

  return NextResponse.json({ ok: true, slug });
}

/** Rename a facility, or activate/deactivate it. */
export async function PATCH(req: NextRequest) {
  if (!(await requireAdmin(req))) return DENIED;

  const body = await req.json().catch(() => ({}));
  const slug = String(body?.slug ?? '');
  if (!slug) return NextResponse.json({ error: 'Missing facility.' }, { status: 400 });

  const patch: Record<string, unknown> = {};
  if (typeof body?.name === 'string' && body.name.trim()) patch.name = body.name.trim();
  if (typeof body?.isActive === 'boolean') patch.is_active = body.isActive;

  if (!Object.keys(patch).length) {
    return NextResponse.json({ error: 'Nothing to change.' }, { status: 400 });
  }

  // The slug itself is deliberately not editable. It's in the dashboard URL,
  // and changing it would break every link partners have already bookmarked.
  await portalDb.from('portal_facilities').update(patch).eq('slug', slug);
  return NextResponse.json({ ok: true });
}

/** Remove a facility outright, along with any access grants pointing at it. */
export async function DELETE(req: NextRequest) {
  if (!(await requireAdmin(req))) return DENIED;

  const slug = req.nextUrl.searchParams.get('slug');
  if (!slug) return NextResponse.json({ error: 'Missing facility.' }, { status: 400 });

  // portal_facility_access stores the slug as plain text with no foreign key,
  // so orphaned grants have to be cleared explicitly.
  await portalDb.from('portal_facility_access').delete().eq('facility_slug', slug);
  await portalDb.from('portal_facilities').delete().eq('slug', slug);

  return NextResponse.json({ ok: true });
}

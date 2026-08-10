import { NextRequest, NextResponse } from 'next/server';
import { facilitiesForUser, portalDb } from '@/lib/portal/db';
import { readSessionToken, SESSION_COOKIE } from '@/lib/portal/session';
import { listFacilities } from '@/lib/portal/facilities';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Who am I, and which facilities can I open? Used by the facility picker. */
export async function GET(req: NextRequest) {
  const session = await readSessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  // Re-read the DB rather than trusting the cookie: a user deactivated after
  // signing in should stop working immediately.
  const { data: user } = await portalDb
    .from('portal_users')
    .select('id, email, full_name, role, is_active')
    .eq('id', session.sub)
    .maybeSingle();

  if (!user || !user.is_active) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  }

  const all = await listFacilities();

  // Admins see everything; partners see only what they've been granted.
  const visible =
    user.role === 'admin'
      ? all
      : await facilitiesForUser(user.id).then((slugs) =>
          all.filter((f) => slugs.includes(f.slug)),
        );

  return NextResponse.json({
    email: user.email,
    fullName: user.full_name,
    role: user.role,
    facilities: visible.map((f) => ({ slug: f.slug, name: f.name })),
  });
}

import { NextRequest, NextResponse } from 'next/server';

import { portalDb } from './db';
import { readSessionToken, SESSION_COOKIE } from './session';

/**
 * Returns the signed-in admin, or null. The role is read from the database,
 * not the cookie, so demoting or deactivating an admin takes effect at once.
 */
export async function requireAdmin(req: NextRequest): Promise<{ id: string; email: string } | null> {
  const session = await readSessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (!session) return null;

  const { data: user } = await portalDb
    .from('portal_users')
    .select('id, email, role, is_active')
    .eq('id', session.sub)
    .maybeSingle();

  if (!user || !user.is_active || user.role !== 'admin') return null;
  return { id: user.id, email: user.email };
}

export function denied() {
  return NextResponse.json({ error: 'Not authorised' }, { status: 403 });
}

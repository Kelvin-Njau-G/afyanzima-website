import { createClient } from '@supabase/supabase-js';

/**
 * Server-only Supabase client for the partner portal.
 *
 * Deliberately NOT prefixed with NEXT_PUBLIC_ — neither of these env vars is
 * ever shipped to the browser, and this module must only be imported from
 * route handlers / server components. The portal_* tables have RLS enabled
 * with no policies, so the service_role key is the only way in.
 */
const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
}

export const portalDb = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export type PortalUser = {
  id: string;
  email: string;
  full_name: string | null;
  role: 'partner' | 'admin';
  is_active: boolean;
  created_at: string;
  last_login_at: string | null;
};

/** Look up an active portal user by email. Returns null if missing or deactivated. */
export async function findActiveUserByEmail(email: string): Promise<PortalUser | null> {
  const { data } = await portalDb
    .from('portal_users')
    .select('*')
    .eq('email', email.trim().toLowerCase())
    .eq('is_active', true)
    .maybeSingle();
  return (data as PortalUser) ?? null;
}

/** The facility slugs a user may view. Admins are handled separately (they see all). */
export async function facilitiesForUser(userId: string): Promise<string[]> {
  const { data } = await portalDb
    .from('portal_facility_access')
    .select('facility_slug')
    .eq('user_id', userId);
  return (data ?? []).map((r: { facility_slug: string }) => r.facility_slug);
}

/**
 * Authoritative access check, hit on every dashboard data request.
 * Re-reads the DB rather than trusting the session cookie, so revoking a
 * facility in /admin takes effect immediately instead of at session expiry.
 */
export async function userCanViewFacility(userId: string, slug: string): Promise<boolean> {
  const { data: user } = await portalDb
    .from('portal_users')
    .select('role, is_active')
    .eq('id', userId)
    .maybeSingle();

  if (!user || !user.is_active) return false;
  if (user.role === 'admin') return true;

  const { data } = await portalDb
    .from('portal_facility_access')
    .select('facility_slug')
    .eq('user_id', userId)
    .eq('facility_slug', slug)
    .maybeSingle();

  return !!data;
}

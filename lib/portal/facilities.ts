import { portalDb } from './db';
import { FACILITIES } from '@/lib/facilities';

/**
 * Facility list, read from the database so admins can add new ones without a
 * deploy.
 *
 * `lib/facilities.ts` is still consulted as a fallback: if a slug somehow
 * isn't in portal_facilities yet, the hardcoded entry keeps that dashboard
 * working rather than 404ing. Once you've confirmed the table is seeded, that
 * fallback is dead weight and can go along with the legacy passwords.
 */
export type PortalFacility = {
  slug: string;
  name: string;
  is_active: boolean;
};

export async function listFacilities(includeInactive = false): Promise<PortalFacility[]> {
  const query = portalDb.from('portal_facilities').select('slug, name, is_active').order('name');
  const { data, error } = includeInactive ? await query : await query.eq('is_active', true);

  if (error || !data) {
    // Table missing or unreachable — fall back so dashboards keep working.
    return Object.entries(FACILITIES).map(([slug, f]) => ({
      slug,
      name: f.name,
      is_active: true,
    }));
  }

  return data as PortalFacility[];
}

/** Resolve one slug to its facility. Returns null if unknown or deactivated. */
export async function getFacility(slug: string): Promise<PortalFacility | null> {
  const { data } = await portalDb
    .from('portal_facilities')
    .select('slug, name, is_active')
    .eq('slug', slug)
    .maybeSingle();

  if (data) {
    return (data as PortalFacility).is_active ? (data as PortalFacility) : null;
  }

  const legacy = FACILITIES[slug];
  return legacy ? { slug, name: legacy.name, is_active: true } : null;
}

/**
 * Turn a facility name into a URL slug: "St Mary's Clinic Ltd." -> st-marys-clinic-ltd
 * Used to suggest a slug in the admin form; the admin can override it.
 */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

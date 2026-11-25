import { createClient } from '@supabase/supabase-js';

import { hashLinkToken, type PublicTestimonial, type TestimonialRow } from './shared';

/** Cache tag for the homepage's testimonial list; cleared whenever one is published, edited or unpublished. */
export const TESTIMONIALS_TAG = 'testimonials';

/**
 * Published testimonials for the homepage, newest first.
 *
 * Unlike the portal, the homepage SHOULD be cached: it uses its own client
 * whose reads are kept for 5 minutes under TESTIMONIALS_TAG, and /admin clears
 * that tag the moment something changes. Every failure returns an empty list:
 * a database hiccup should hide the testimonials section, never take the
 * whole homepage down with it.
 */
export async function listPublishedTestimonials(): Promise<PublicTestimonial[]> {
  try {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return [];
    const db = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, init) => fetch(input, { ...init, next: { revalidate: 300, tags: [TESTIMONIALS_TAG] } }),
      },
    });
    const { data, error } = await db
      .from('portal_testimonials')
      .select('id, comment, director_name, facility_name')
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .limit(30);
    if (error || !data) return [];
    return data
      .filter((r) => r.comment && r.director_name)
      .map((r) => ({
        id: r.id,
        comment: r.comment as string,
        directorName: r.director_name as string,
        facilityName: r.facility_name as string,
      }));
  } catch {
    return [];
  }
}

export type RequestLookup =
  | { state: 'open'; row: TestimonialRow }
  | { state: 'done' }
  | { state: 'expired' }
  | { state: 'invalid' };

/** Resolve a link token from an email to its request, and say whether it can still be answered. */
export async function findRequestByToken(token: string): Promise<RequestLookup> {
  if (!token || token.length < 20 || token.length > 100) return { state: 'invalid' };

  const { portalDb } = await import('@/lib/portal/db');
  const { data } = await portalDb
    .from('portal_testimonials')
    .select('*')
    .eq('token_hash', hashLinkToken(token))
    .maybeSingle();

  const row = data as TestimonialRow | null;
  if (!row) return { state: 'invalid' };
  if (row.status === 'cancelled') return { state: 'invalid' };
  if (row.status !== 'requested') return { state: 'done' };
  if (!row.token_expires_at || new Date(row.token_expires_at) < new Date()) return { state: 'expired' };
  return { state: 'open', row };
}

import crypto from 'crypto';

/** How long a testimonial request link stays usable. */
export const REQUEST_LINK_DAYS = 30;

/** Limits on what a director can submit. ~3000 characters is about 500 words. */
export const COMMENT_MIN = 20;
export const COMMENT_MAX = 3000;
export const NAME_MAX = 100;

export type TestimonialStatus = 'requested' | 'pending' | 'published' | 'unpublished' | 'cancelled';

export type TestimonialRow = {
  id: string;
  status: TestimonialStatus;
  facility_slug: string | null;
  facility_name: string;
  recipient_user_id: string | null;
  recipient_email: string | null;
  requested_at: string;
  token_expires_at: string | null;
  director_name: string | null;
  rating: number | null;
  original_comment: string | null;
  comment: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  published_at: string | null;
};

/** What the public homepage needs, and nothing else. */
export type PublicTestimonial = {
  id: string;
  comment: string;
  directorName: string;
  facilityName: string;
};

/**
 * A new link token. 32 random bytes is unguessable; only its hash is stored,
 * so a leaked database copy can't be turned back into working links.
 */
export function newLinkToken(): { token: string; hash: string } {
  const token = crypto.randomBytes(32).toString('base64url');
  return { token, hash: hashLinkToken(token) };
}

export function hashLinkToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function linkExpiry(): string {
  return new Date(Date.now() + REQUEST_LINK_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * The facility name as patients see it. portal_facilities.name has to match
 * Metabase exactly ("Healmerc Pharmacy Limited"), but the website drops the
 * company suffix.
 */
export function displayFacilityName(name: string): string {
  return name.replace(/[\s,]+(limited|ltd\.?)$/i, '').trim();
}

/** Collapse runs of spaces/blank lines, trim the ends. Keeps single line breaks. */
export function tidyText(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

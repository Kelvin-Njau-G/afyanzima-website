import crypto from 'crypto';

export const OTP_TTL_MINUTES = 10;
export const OTP_MAX_ATTEMPTS = 5;

/** Max OTP requests per email address within the window below. */
export const OTP_MAX_PER_USER = 3;
/** Max OTP requests from one IP within the window below (catches scripted probing). */
export const OTP_MAX_PER_IP = 12;
export const OTP_RATE_WINDOW_MINUTES = 15;

/**
 * A 6-digit code from a cryptographically secure source.
 * randomInt() over the full range avoids the modulo bias you get from
 * Math.floor(Math.random() * 900000) + 100000 style generators.
 */
export function generateCode(): string {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

/**
 * Codes are never stored in plaintext. Peppered + salted by user id, so two
 * users holding the same code produce different hashes and a leaked table
 * dump is not directly replayable.
 */
export function hashCode(code: string, userId: string): string {
  const pepper = process.env.PORTAL_OTP_PEPPER || process.env.PORTAL_SESSION_SECRET;
  if (!pepper) throw new Error('PORTAL_OTP_PEPPER or PORTAL_SESSION_SECRET must be set');
  return crypto.createHmac('sha256', pepper).update(`${userId}:${code}`).digest('hex');
}

/** Constant-time comparison so response timing can't be used to guess digits. */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

export function expiryFromNow(): string {
  return new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000).toISOString();
}

export function rateWindowStart(): string {
  return new Date(Date.now() - OTP_RATE_WINDOW_MINUTES * 60 * 1000).toISOString();
}

/** Best-effort client IP behind Vercel's proxy. */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return headers.get('x-real-ip') ?? 'unknown';
}

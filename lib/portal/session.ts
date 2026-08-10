import { SignJWT, jwtVerify } from 'jose';

/**
 * Portal session = an HMAC-signed (HS256) JWT in an httpOnly cookie.
 *
 * Uses `jose` rather than node crypto so this module also runs inside
 * middleware on the edge runtime. Deliberately carries the bare minimum:
 * the facility list is NOT in the token, because it must stay revocable —
 * every data request re-checks the database instead.
 */

const ISSUER = 'afyanzima-portal';
const AUDIENCE = 'afyanzima-portal';

export const SESSION_COOKIE = 'portal_session';
export const SESSION_HOURS = 12;

export type PortalSession = {
  sub: string; // portal_users.id
  email: string;
  role: 'partner' | 'admin';
};

function secret(): Uint8Array {
  const value = process.env.PORTAL_SESSION_SECRET;
  if (!value || value.length < 32) {
    throw new Error('PORTAL_SESSION_SECRET must be set to at least 32 characters');
  }
  return new TextEncoder().encode(value);
}

export async function createSessionToken(session: PortalSession): Promise<string> {
  return new SignJWT({ email: session.email, role: session.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(session.sub)
    .setIssuedAt()
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setExpirationTime(`${SESSION_HOURS}h`)
    .sign(secret());
}

/** Verify a token. Returns null for anything invalid, expired, or tampered with. */
export async function readSessionToken(token?: string | null): Promise<PortalSession | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), {
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    if (!payload.sub) return null;
    return {
      sub: payload.sub,
      email: String(payload.email ?? ''),
      role: payload.role === 'admin' ? 'admin' : 'partner',
    };
  } catch {
    return null;
  }
}

export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: SESSION_HOURS * 60 * 60,
};

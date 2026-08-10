import { NextRequest, NextResponse } from 'next/server';
import { portalDb, findActiveUserByEmail } from '@/lib/portal/db';
import {
  generateCode,
  hashCode,
  expiryFromNow,
  rateWindowStart,
  clientIp,
  OTP_MAX_PER_USER,
  OTP_MAX_PER_IP,
} from '@/lib/portal/otp';
import { sendOtpEmail } from '@/lib/portal/email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Step 1 of login: accept an email, and if it belongs to an active portal
 * user, mail them a one-time code.
 *
 * This endpoint ALWAYS responds { ok: true }, whatever happens. Unknown
 * address, deactivated account, rate limit hit, mail failure — same response
 * every time. On a public website, an endpoint that distinguishes "registered"
 * from "not registered" is a free list of which of your partners' email
 * addresses are valid, so we refuse to leak that distinction.
 */
export async function POST(req: NextRequest) {
  const ok = NextResponse.json({ ok: true });

  let email = '';
  try {
    const body = await req.json();
    email = String(body?.email ?? '').trim().toLowerCase();
  } catch {
    return ok;
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return ok;

  const ip = clientIp(req.headers);
  const windowStart = rateWindowStart();

  try {
    // Per-IP throttle first — this is the one that stops scripted probing of
    // many addresses from a single source.
    const { count: ipCount } = await portalDb
      .from('portal_otp_codes')
      .select('id', { count: 'exact', head: true })
      .eq('request_ip', ip)
      .gte('created_at', windowStart);

    if ((ipCount ?? 0) >= OTP_MAX_PER_IP) return ok;

    const user = await findActiveUserByEmail(email);
    if (!user) return ok;

    // Per-user throttle — stops someone spamming a real partner's inbox.
    const { count: userCount } = await portalDb
      .from('portal_otp_codes')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('created_at', windowStart);

    if ((userCount ?? 0) >= OTP_MAX_PER_USER) return ok;

    // Any earlier live code is retired, so only the newest one works.
    await portalDb
      .from('portal_otp_codes')
      .update({ consumed_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .is('consumed_at', null);

    const code = generateCode();

    const { error } = await portalDb.from('portal_otp_codes').insert({
      user_id: user.id,
      code_hash: hashCode(code, user.id),
      expires_at: expiryFromNow(),
      request_ip: ip,
    });
    if (error) return ok;

    await sendOtpEmail(user.email, code);
  } catch (err) {
    // Logged for you, invisible to the caller.
    console.error('[portal] request-otp failed:', err);
  }

  return ok;
}

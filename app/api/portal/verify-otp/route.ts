import { NextRequest, NextResponse } from 'next/server';
import { portalDb, findActiveUserByEmail, facilitiesForUser } from '@/lib/portal/db';
import { hashCode, safeEqual, OTP_MAX_ATTEMPTS } from '@/lib/portal/otp';
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions } from '@/lib/portal/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** One generic failure message — never reveals which part was wrong. */
const FAILED = { error: 'That code is incorrect or has expired.' };

/**
 * Step 2 of login: exchange email + code for a session cookie.
 */
export async function POST(req: NextRequest) {
  let email = '';
  let code = '';
  try {
    const body = await req.json();
    email = String(body?.email ?? '').trim().toLowerCase();
    code = String(body?.code ?? '').trim();
  } catch {
    return NextResponse.json(FAILED, { status: 401 });
  }

  if (!email || !/^\d{6}$/.test(code)) {
    return NextResponse.json(FAILED, { status: 401 });
  }

  const user = await findActiveUserByEmail(email);
  if (!user) return NextResponse.json(FAILED, { status: 401 });

  const { data: row } = await portalDb
    .from('portal_otp_codes')
    .select('*')
    .eq('user_id', user.id)
    .is('consumed_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!row) return NextResponse.json(FAILED, { status: 401 });

  if (row.attempts >= OTP_MAX_ATTEMPTS) {
    // Burn it rather than leaving a code sitting there being guessed at.
    await portalDb
      .from('portal_otp_codes')
      .update({ consumed_at: new Date().toISOString() })
      .eq('id', row.id);
    return NextResponse.json(
      { error: 'Too many attempts. Please request a new code.' },
      { status: 429 },
    );
  }

  // Count the attempt before checking it, so a crash mid-request can't be
  // used to get unlimited free guesses.
  await portalDb
    .from('portal_otp_codes')
    .update({ attempts: row.attempts + 1 })
    .eq('id', row.id);

  if (!safeEqual(row.code_hash, hashCode(code, user.id))) {
    return NextResponse.json(FAILED, { status: 401 });
  }

  // Single use.
  await portalDb
    .from('portal_otp_codes')
    .update({ consumed_at: new Date().toISOString() })
    .eq('id', row.id);

  await portalDb
    .from('portal_users')
    .update({ last_login_at: new Date().toISOString() })
    .eq('id', user.id);

  const token = await createSessionToken({
    sub: user.id,
    email: user.email,
    role: user.role,
  });

  // Where to land them.
  let redirect = '/partner-portal/facilities';
  if (user.role === 'admin') {
    redirect = '/admin';
  } else {
    const slugs = await facilitiesForUser(user.id);
    if (slugs.length === 1) redirect = `/partner-facilities/${slugs[0]}`;
    else if (slugs.length === 0) redirect = '/partner-portal/facilities';
  }

  const res = NextResponse.json({ ok: true, redirect });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions);
  return res;
}

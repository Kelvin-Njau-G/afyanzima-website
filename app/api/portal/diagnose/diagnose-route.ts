import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * TEMPORARY DIAGNOSTIC — DELETE THIS FILE ONCE LOGIN WORKS.
 *
 * The real login endpoint deliberately swallows every failure so it can't be
 * used to work out which email addresses are registered. That's the right
 * behaviour in production and unhelpful when you're debugging, so this route
 * reports what actually happened instead.
 *
 * Usage:
 *   /api/portal/diagnose?key=YOUR_DIAGNOSTIC_KEY&email=you@afyanzima.com
 *
 * Add &send=1 to also attempt a real test email.
 *
 * Never reports secret VALUES — only whether they're present, how long they
 * are, and what they start with.
 */
export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get('key');
  const expected = process.env.PORTAL_DIAGNOSTIC_KEY;

  if (!expected || key !== expected) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const email = (req.nextUrl.searchParams.get('email') ?? '').trim().toLowerCase();
  const alsoSend = req.nextUrl.searchParams.get('send') === '1';

  const report: Record<string, unknown> = {};

  // ---- 1. Environment ------------------------------------------------
  const describe = (name: string) => {
    const v = process.env[name];
    if (!v) return 'MISSING';
    return {
      length: v.length,
      startsWith: v.slice(0, 8),
      hasWhitespace: /\s/.test(v),
      hasQuotes: /^["']|["']$/.test(v),
    };
  };

  report.env = {
    SUPABASE_URL: process.env.SUPABASE_URL ?? 'MISSING',
    SUPABASE_SERVICE_ROLE_KEY: describe('SUPABASE_SERVICE_ROLE_KEY'),
    PORTAL_SESSION_SECRET: describe('PORTAL_SESSION_SECRET'),
    PORTAL_OTP_PEPPER: describe('PORTAL_OTP_PEPPER'),
    RESEND_API_KEY: describe('RESEND_API_KEY'),
    PORTAL_EMAIL_FROM: process.env.PORTAL_EMAIL_FROM ?? 'MISSING',
  };

  // A service_role JWT carries "role":"service_role" in its payload. Decoding
  // the middle segment tells us which key was pasted in, without revealing it.
  try {
    const raw = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
    const parts = raw.split('.');
    if (parts.length === 3) {
      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
      report.keyRole = payload.role ?? 'unknown';
    } else {
      report.keyRole = 'not a JWT — this may be a publishable/secret-format key';
    }
  } catch {
    report.keyRole = 'could not decode';
  }

  // ---- 2. Can we actually read the tables? ---------------------------
  try {
    const db = createClient(
      process.env.SUPABASE_URL ?? '',
      process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    const { count, error } = await db
      .from('portal_users')
      .select('id', { count: 'exact', head: true });

    report.database = error
      ? { ok: false, message: error.message, code: error.code, hint: error.hint }
      : { ok: true, portalUsersVisible: count };

    if (email) {
      const { data, error: lookupError } = await db
        .from('portal_users')
        .select('id, email, role, is_active')
        .eq('email', email)
        .maybeSingle();

      report.lookup = lookupError
        ? { ok: false, message: lookupError.message }
        : data
          ? { found: true, role: data.role, isActive: data.is_active }
          : { found: false, searchedFor: email };
    }
  } catch (err) {
    report.database = { ok: false, threw: String(err) };
  }

  // ---- 3. Will Resend accept a message? ------------------------------
  if (alsoSend && email) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: process.env.PORTAL_EMAIL_FROM ?? 'AfyaNzima <portal@afyanzima.com>',
          to: [email],
          subject: 'AfyaNzima portal test',
          text: 'If you are reading this, Resend delivery works.',
        }),
      });
      report.resend = { status: res.status, body: await res.text() };
    } catch (err) {
      report.resend = { threw: String(err) };
    }
  }

  return NextResponse.json(report, { status: 200 });
}

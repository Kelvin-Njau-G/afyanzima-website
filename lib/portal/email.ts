import { OTP_TTL_MINUTES } from './otp';

/**
 * OTP delivery via the Resend HTTP API.
 *
 * Called directly rather than through Supabase's SMTP settings, which are
 * project-wide and shared with the Orders platform. Keeping this separate
 * means portal email config can change without touching Orders.
 */
const RESEND_ENDPOINT = 'https://api.resend.com/emails';

export async function sendOtpEmail(to: string, code: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.PORTAL_EMAIL_FROM ?? 'AfyaNzima <portal@afyanzima.com>';

  if (!apiKey) throw new Error('RESEND_API_KEY is not set');

  const res = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: `${code} is your AfyaNzima login code`,
      text: [
        `Your AfyaNzima Partner Portal login code is ${code}.`,
        ``,
        `It expires in ${OTP_TTL_MINUTES} minutes and can only be used once.`,
        ``,
        `If you didn't try to sign in, you can ignore this email — no one can`,
        `access your dashboard without this code.`,
      ].join('\n'),
      html: `
        <div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;max-width:420px;margin:0 auto;padding:32px 24px;color:#111827">
          <h1 style="font-size:16px;font-weight:600;color:#066DB7;margin:0 0 24px">AfyaNzima Partner Portal</h1>
          <p style="font-size:14px;line-height:1.6;margin:0 0 20px">Use this code to finish signing in:</p>
          <div style="font-size:32px;font-weight:600;letter-spacing:8px;text-align:center;padding:20px;background:#f9fafb;border-radius:12px;margin:0 0 20px">${code}</div>
          <p style="font-size:13px;line-height:1.6;color:#6b7280;margin:0 0 8px">
            Expires in ${OTP_TTL_MINUTES} minutes and can only be used once.
          </p>
          <p style="font-size:13px;line-height:1.6;color:#6b7280;margin:0">
            If you didn't try to sign in, ignore this email — no one can reach your
            dashboard without this code.
          </p>
        </div>
      `,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Resend rejected the message (${res.status}): ${detail}`);
  }
}

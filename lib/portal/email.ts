import { OTP_TTL_MINUTES } from './otp';

/**
 * OTP delivery via the Resend HTTP API.
 *
 * Called directly rather than through Supabase's SMTP settings, which are
 * project-wide and shared with the Orders platform. Keeping this separate
 * means portal email config can change without touching Orders.
 */
const RESEND_ENDPOINT = 'https://api.resend.com/emails';

type Message = { to: string; subject: string; text: string; html: string };

async function send(message: Message): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.PORTAL_EMAIL_FROM ?? 'AfyaNzima <portal@afyanzima.com>';

  if (!apiKey) throw new Error('RESEND_API_KEY is not set');

  const res = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to: [message.to], subject: message.subject, text: message.text, html: message.html }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Resend rejected the message (${res.status}): ${detail}`);
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** Asks a facility director to share a testimonial, with their private link. */
export async function sendTestimonialRequestEmail(opts: {
  to: string;
  name: string | null;
  facilityName: string;
  link: string;
  expiresInDays: number;
}): Promise<void> {
  const greeting = opts.name ? `Hello ${opts.name.split(' ')[0]},` : 'Hello,';
  const name = opts.name ? escapeHtml(opts.name.split(' ')[0]) : '';
  const facility = escapeHtml(opts.facilityName);

  await send({
    to: opts.to,
    subject: `How has your partnership with AfyaNzima been?`,
    text: [
      greeting,
      ``,
      `We'd love to hear how working with AfyaNzima has been for ${opts.facilityName} so far.`,
      `It takes about two minutes: give a star rating and tell us about your experience in your own words.`,
      ``,
      `Share your feedback: ${opts.link}`,
      ``,
      `With your permission, we may feature your comment on our website. This link is personal to you`,
      `and works for ${opts.expiresInDays} days.`,
      ``,
      `Thank you,`,
      `The AfyaNzima team`,
    ].join('\n'),
    html: `
      <div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;max-width:460px;margin:0 auto;padding:32px 24px;color:#111827">
        <h1 style="font-size:16px;font-weight:600;color:#006CB5;margin:0 0 24px">AfyaNzima</h1>
        <p style="font-size:14px;line-height:1.6;margin:0 0 16px">${name ? `Hello ${name},` : 'Hello,'}</p>
        <p style="font-size:14px;line-height:1.6;margin:0 0 16px">
          We'd love to hear how working with AfyaNzima has been for ${facility} so far.
          It takes about two minutes: give a star rating and tell us about your experience in your own words.
        </p>
        <p style="margin:24px 0;text-align:center">
          <a href="${opts.link}" style="display:inline-block;background:#006CB5;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 24px;border-radius:999px">
            Share your feedback
          </a>
        </p>
        <p style="font-size:13px;line-height:1.6;color:#6b7280;margin:0 0 8px">
          With your permission, we may feature your comment on our website.
          This link is personal to you and works for ${opts.expiresInDays} days.
        </p>
        <p style="font-size:14px;line-height:1.6;margin:24px 0 0">Thank you,<br />The AfyaNzima team</p>
      </div>
    `,
  });
}

export async function sendOtpEmail(to: string, code: string): Promise<void> {
  await send({
    to,
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
  });
}

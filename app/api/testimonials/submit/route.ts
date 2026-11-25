import { NextRequest, NextResponse } from 'next/server';

import { portalDb } from '@/lib/portal/db';
import { findRequestByToken } from '@/lib/testimonials/server';
import { COMMENT_MAX, COMMENT_MIN, NAME_MAX, tidyText } from '@/lib/testimonials/shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * A director submits their testimonial from the link in their email.
 * No sign-in: the unguessable link is the permission, and it works once.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const token = String(body?.token ?? '');
  const rating = Number(body?.rating);
  const comment = tidyText(String(body?.comment ?? ''));
  const directorName = String(body?.directorName ?? '').trim();

  const found = await findRequestByToken(token);
  if (found.state === 'done') {
    return NextResponse.json({ error: 'This feedback has already been submitted. Thank you!' }, { status: 409 });
  }
  if (found.state === 'expired') {
    return NextResponse.json(
      { error: 'This link has expired. Please ask AfyaNzima to send you a new one.' },
      { status: 410 },
    );
  }
  if (found.state !== 'open') {
    return NextResponse.json({ error: 'This link is not valid.' }, { status: 404 });
  }

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return NextResponse.json({ error: 'Please choose a star rating.' }, { status: 400 });
  }
  if (comment.length < COMMENT_MIN) {
    return NextResponse.json(
      { error: `Please write at least ${COMMENT_MIN} characters about your experience.` },
      { status: 400 },
    );
  }
  if (comment.length > COMMENT_MAX) {
    return NextResponse.json({ error: `Please keep your comment under ${COMMENT_MAX} characters.` }, { status: 400 });
  }
  if (!directorName || directorName.length > NAME_MAX) {
    return NextResponse.json({ error: 'Please enter your name.' }, { status: 400 });
  }

  // Only flips a request that is still open, so a double-click or a second
  // tab can't submit twice.
  const { data, error } = await portalDb
    .from('portal_testimonials')
    .update({
      status: 'pending',
      rating,
      original_comment: comment,
      comment,
      director_name: directorName,
      // token_hash is kept so reopening the link says "already submitted"
      // rather than "invalid". Only 'requested' rows accept submissions.
      submitted_at: new Date().toISOString(),
    })
    .eq('id', found.row.id)
    .eq('status', 'requested')
    .select('id');

  if (error) {
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
  if (!data?.length) {
    return NextResponse.json({ error: 'This feedback has already been submitted. Thank you!' }, { status: 409 });
  }

  return NextResponse.json({ ok: true });
}

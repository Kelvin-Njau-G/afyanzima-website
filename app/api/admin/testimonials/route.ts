import { revalidatePath, revalidateTag } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';

import { portalDb } from '@/lib/portal/db';
import { sendTestimonialRequestEmail } from '@/lib/portal/email';
import { getFacility } from '@/lib/portal/facilities';
import { denied, requireAdmin } from '@/lib/portal/require-admin';
import { TESTIMONIALS_TAG } from '@/lib/testimonials/server';
import {
  COMMENT_MAX,
  COMMENT_MIN,
  displayFacilityName,
  linkExpiry,
  NAME_MAX,
  newLinkToken,
  REQUEST_LINK_DAYS,
  tidyText,
  type TestimonialRow,
} from '@/lib/testimonials/shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const COLUMNS =
  'id, status, facility_slug, facility_name, recipient_user_id, recipient_email, requested_at, token_expires_at, director_name, rating, original_comment, comment, submitted_at, reviewed_at, published_at';

function siteUrl(req: NextRequest): string {
  return (process.env.PUBLIC_SITE_URL || req.nextUrl.origin).replace(/\/$/, '');
}

/** The homepage caches its testimonials; refresh it whenever what's public may have changed. */
function refreshHomepage() {
  try {
    revalidateTag(TESTIMONIALS_TAG);
    revalidatePath('/');
  } catch {
    // Not fatal: the homepage also refreshes itself every few minutes.
  }
}

/** Every testimonial except withdrawn requests, newest activity first. */
export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req))) return denied();

  const { data, error } = await portalDb
    .from('portal_testimonials')
    .select(COLUMNS)
    .neq('status', 'cancelled')
    .order('requested_at', { ascending: false });

  if (error) {
    return NextResponse.json(
      { error: 'Could not load testimonials. Has supabase/portal-testimonials.sql been run?' },
      { status: 500 },
    );
  }
  return NextResponse.json({ testimonials: data as TestimonialRow[] });
}

/** Request a testimonial: create the request and email the director their link. */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return denied();

  const body = await req.json().catch(() => ({}));
  const facilitySlug = String(body?.facilitySlug ?? '');
  const userId = String(body?.userId ?? '');

  const facility = facilitySlug ? await getFacility(facilitySlug) : null;
  if (!facility) {
    return NextResponse.json({ error: 'Choose a facility.' }, { status: 400 });
  }

  // The recipient must be an active account with access to this facility.
  const { data: user } = await portalDb
    .from('portal_users')
    .select('id, email, full_name, is_active')
    .eq('id', userId)
    .maybeSingle();
  const { data: access } = await portalDb
    .from('portal_facility_access')
    .select('facility_slug')
    .eq('user_id', userId)
    .eq('facility_slug', facilitySlug)
    .maybeSingle();

  if (!user || !user.is_active || !access) {
    return NextResponse.json({ error: 'Choose an active account that is linked to this facility.' }, { status: 400 });
  }

  const facilityName = displayFacilityName(facility.name);
  const { token, hash } = newLinkToken();

  const { data: row, error } = await portalDb
    .from('portal_testimonials')
    .insert({
      status: 'requested',
      facility_slug: facility.slug,
      facility_name: facilityName,
      recipient_user_id: user.id,
      recipient_email: user.email,
      requested_by: admin.id,
      director_name: user.full_name,
      token_hash: hash,
      token_expires_at: linkExpiry(),
    })
    .select('id')
    .single();

  if (error || !row) {
    return NextResponse.json(
      { error: 'Could not create the request. Has supabase/portal-testimonials.sql been run?' },
      { status: 500 },
    );
  }

  try {
    await sendTestimonialRequestEmail({
      to: user.email,
      name: user.full_name,
      facilityName,
      link: `${siteUrl(req)}/testimonial/${token}`,
      expiresInDays: REQUEST_LINK_DAYS,
    });
  } catch {
    // No email means no usable link, so don't leave a dead request behind.
    await portalDb.from('portal_testimonials').delete().eq('id', row.id);
    return NextResponse.json(
      { error: `The email to ${user.email} could not be sent. Please try again.` },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true, sentTo: user.email });
}

/**
 * Act on one testimonial.
 *   save       update the public text / name / facility label, nothing else
 *   publish    save, then show it on the website
 *   unpublish  save, then keep it off the website
 *   resend     email a fresh link (the old one stops working)
 *   cancel     withdraw a request that hasn't been answered
 *
 * The star rating is never accepted here, and the database refuses to change
 * it even if something tried.
 */
export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return denied();

  const body = await req.json().catch(() => ({}));
  const id = String(body?.id ?? '');
  const action = String(body?.action ?? '');

  const { data: current } = await portalDb.from('portal_testimonials').select(COLUMNS).eq('id', id).maybeSingle();
  const t = current as TestimonialRow | null;
  if (!t) return NextResponse.json({ error: 'Testimonial not found.' }, { status: 404 });

  if (action === 'cancel') {
    if (t.status !== 'requested') {
      return NextResponse.json({ error: 'Only unanswered requests can be withdrawn.' }, { status: 400 });
    }
    await portalDb
      .from('portal_testimonials')
      .update({ status: 'cancelled', token_hash: null })
      .eq('id', id)
      .eq('status', 'requested');
    return NextResponse.json({ ok: true });
  }

  if (action === 'resend') {
    if (t.status !== 'requested' || !t.recipient_email) {
      return NextResponse.json({ error: 'Only unanswered requests can be resent.' }, { status: 400 });
    }
    const { token, hash } = newLinkToken();
    const { error } = await portalDb
      .from('portal_testimonials')
      .update({ token_hash: hash, token_expires_at: linkExpiry() })
      .eq('id', id)
      .eq('status', 'requested');
    if (error) return NextResponse.json({ error: 'Could not resend.' }, { status: 500 });
    try {
      await sendTestimonialRequestEmail({
        to: t.recipient_email,
        name: t.director_name,
        facilityName: t.facility_name,
        link: `${siteUrl(req)}/testimonial/${token}`,
        expiresInDays: REQUEST_LINK_DAYS,
      });
    } catch {
      return NextResponse.json(
        { error: `The email to ${t.recipient_email} could not be sent. Please try again.` },
        { status: 502 },
      );
    }
    return NextResponse.json({ ok: true, sentTo: t.recipient_email });
  }

  if (!['save', 'publish', 'unpublish'].includes(action)) {
    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
  }
  if (!['pending', 'published', 'unpublished'].includes(t.status)) {
    return NextResponse.json({ error: 'This testimonial has not been submitted yet.' }, { status: 400 });
  }

  const comment = body?.comment === undefined ? t.comment ?? '' : tidyText(String(body.comment));
  const directorName = body?.directorName === undefined ? t.director_name ?? '' : String(body.directorName).trim();
  const facilityName = body?.facilityName === undefined ? t.facility_name : String(body.facilityName).trim();

  if (comment.length < COMMENT_MIN || comment.length > COMMENT_MAX) {
    return NextResponse.json(
      { error: `The testimonial must be between ${COMMENT_MIN} and ${COMMENT_MAX} characters.` },
      { status: 400 },
    );
  }
  if (!directorName || directorName.length > NAME_MAX) {
    return NextResponse.json({ error: "The director's name is required." }, { status: 400 });
  }
  if (!facilityName || facilityName.length > NAME_MAX) {
    return NextResponse.json({ error: 'The facility name is required.' }, { status: 400 });
  }

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    comment,
    director_name: directorName,
    facility_name: facilityName,
    reviewed_at: now,
  };
  if (action === 'publish') {
    patch.status = 'published';
    if (t.status !== 'published') patch.published_at = now;
  }
  if (action === 'unpublish') patch.status = 'unpublished';

  const { error } = await portalDb.from('portal_testimonials').update(patch).eq('id', id);
  if (error) return NextResponse.json({ error: 'Could not save.' }, { status: 500 });

  if (t.status === 'published' || action === 'publish') refreshHomepage();
  return NextResponse.json({ ok: true });
}

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import type { TestimonialRow } from '@/lib/testimonials/shared';
import { Stars } from '@/components/star-rating';

type Account = {
  id: string;
  email: string;
  full_name: string | null;
  role: 'partner' | 'admin';
  is_active: boolean;
  facilities: string[];
};
type Facility = { slug: string; name: string };

const input = 'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-[#006CB5]';
const primary = 'rounded-lg bg-[#006CB5] px-4 py-2 text-sm font-medium text-white disabled:opacity-50';
const secondary =
  'rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm text-gray-700 hover:border-gray-300 disabled:opacity-50';

function date(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
}

/**
 * Testimonials tab of /admin: request a testimonial from a facility director,
 * review what comes back, tidy the wording, and publish or hold it back.
 */
export default function TestimonialsAdmin({ accounts, facilities }: { accounts: Account[]; facilities: Facility[] }) {
  const [rows, setRows] = useState<TestimonialRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const [facilitySlug, setFacilitySlug] = useState('');
  const [userId, setUserId] = useState('');

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/testimonials');
    const body = await res.json().catch(() => ({}));
    if (!res.ok) setError(body?.error ?? 'Could not load testimonials.');
    else setRows(body.testimonials);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Active partner accounts linked to the chosen facility.
  const recipients = useMemo(
    () => accounts.filter((a) => a.is_active && a.role === 'partner' && a.facilities.includes(facilitySlug)),
    [accounts, facilitySlug],
  );

  useEffect(() => {
    setUserId(recipients.length === 1 ? recipients[0].id : '');
  }, [recipients]);

  async function send(method: 'POST' | 'PATCH', payload: object, success?: (body: any) => string) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const res = await fetch('/api/admin/testimonials', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body?.error ?? 'Something went wrong.');
        return false;
      }
      if (success) setNotice(success(body));
      await load();
      return true;
    } finally {
      setBusy(false);
    }
  }

  async function requestTestimonial(e: React.FormEvent) {
    e.preventDefault();
    const ok = await send('POST', { facilitySlug, userId }, (b) => `Request sent to ${b.sentTo}.`);
    if (ok) {
      setFacilitySlug('');
      setUserId('');
    }
  }

  const act = (id: string, action: string, extra: object = {}, success?: string) =>
    send('PATCH', { id, action, ...extra }, success ? () => success : undefined);

  const groups = {
    pending: rows.filter((r) => r.status === 'pending'),
    published: rows.filter((r) => r.status === 'published'),
    unpublished: rows.filter((r) => r.status === 'unpublished'),
    requested: rows.filter((r) => r.status === 'requested'),
  };

  return (
    <div className="space-y-10">
      <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <h2 className="mb-1 text-sm font-medium text-gray-700">Request a testimonial</h2>
        <p className="mb-4 text-xs leading-relaxed text-gray-500">
          The director gets an email with a private link to rate their experience and write a comment. It comes back
          here for you to review before anything goes on the website.
        </p>
        <form onSubmit={requestTestimonial} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <select value={facilitySlug} onChange={(e) => setFacilitySlug(e.target.value)} required className={input}>
            <option value="">Choose a facility…</option>
            {facilities.map((f) => (
              <option key={f.slug} value={f.slug}>
                {f.name}
              </option>
            ))}
          </select>
          <select
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            required
            disabled={!facilitySlug || recipients.length === 0}
            className={`${input} disabled:bg-gray-50 disabled:text-gray-400`}
          >
            <option value="">
              {!facilitySlug
                ? 'Then choose the director…'
                : recipients.length === 0
                  ? 'No accounts linked to this facility'
                  : 'Choose the director…'}
            </option>
            {recipients.map((a) => (
              <option key={a.id} value={a.id}>
                {a.full_name ? `${a.full_name} (${a.email})` : a.email}
              </option>
            ))}
          </select>
          <button type="submit" disabled={busy || !userId} className={primary}>
            {busy ? 'Working…' : 'Send request'}
          </button>
        </form>
        {facilitySlug && recipients.length === 0 && (
          <p className="mt-3 text-xs text-amber-700">
            Add the director&apos;s email on the Accounts tab and link it to this facility first.
          </p>
        )}
      </section>

      {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      {notice && <p className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800">{notice}</p>}

      {loading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : (
        <>
          <Group title="Waiting for your review" count={groups.pending.length} empty="Nothing to review right now.">
            {groups.pending.map((t) => (
              <ReviewCard key={t.id} t={t} busy={busy} act={act} />
            ))}
          </Group>

          <Group title="Published on the website" count={groups.published.length} empty="No testimonials are live yet.">
            {groups.published.map((t) => (
              <ReviewCard key={t.id} t={t} busy={busy} act={act} />
            ))}
          </Group>

          <Group title="Not published" count={groups.unpublished.length} empty="None.">
            {groups.unpublished.map((t) => (
              <ReviewCard key={t.id} t={t} busy={busy} act={act} />
            ))}
          </Group>

          <Group title="Requests sent, waiting for a reply" count={groups.requested.length} empty="No open requests.">
            {groups.requested.map((t) => {
              const expired = !!t.token_expires_at && new Date(t.token_expires_at) < new Date();
              return (
                <div
                  key={t.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-100 bg-white px-5 py-4 text-sm shadow-sm"
                >
                  <div>
                    <p className="font-medium text-gray-900">{t.facility_name}</p>
                    <p className="text-xs text-gray-500">
                      {t.recipient_email} · sent {date(t.requested_at)} ·{' '}
                      {expired ? (
                        <span className="text-amber-700">link expired</span>
                      ) : (
                        `link works until ${date(t.token_expires_at)}`
                      )}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      disabled={busy}
                      onClick={() => act(t.id, 'resend', {}, `A new link was emailed to ${t.recipient_email}.`)}
                      className={secondary}
                    >
                      Resend email
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => act(t.id, 'cancel', {}, 'Request withdrawn. Its link no longer works.')}
                      className="px-2 text-xs text-gray-500 underline disabled:opacity-50"
                    >
                      Withdraw
                    </button>
                  </div>
                </div>
              );
            })}
          </Group>
        </>
      )}
    </div>
  );
}

function Group({
  title,
  count,
  empty,
  children,
}: {
  title: string;
  count: number;
  empty: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 text-sm font-medium text-gray-700">
        {title}
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">{count}</span>
      </h2>
      {count === 0 ? <p className="text-sm text-gray-400">{empty}</p> : <div className="space-y-4">{children}</div>}
    </section>
  );
}

function ReviewCard({
  t,
  busy,
  act,
}: {
  t: TestimonialRow;
  busy: boolean;
  act: (id: string, action: string, extra?: object, success?: string) => Promise<boolean>;
}) {
  const [comment, setComment] = useState(t.comment ?? '');
  const [name, setName] = useState(t.director_name ?? '');
  const [facility, setFacility] = useState(t.facility_name);
  const [showOriginal, setShowOriginal] = useState(false);

  // Reset the fields if the saved version changes underneath (e.g. after saving).
  useEffect(() => {
    setComment(t.comment ?? '');
    setName(t.director_name ?? '');
    setFacility(t.facility_name);
  }, [t.comment, t.director_name, t.facility_name]);

  const edited = comment !== (t.comment ?? '') || name !== (t.director_name ?? '') || facility !== t.facility_name;
  const differsFromOriginal = !!t.original_comment && t.original_comment !== comment;
  const fields = { comment, directorName: name, facilityName: facility };

  return (
    <article className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {t.rating ? (
            <>
              <Stars value={t.rating} size="size-5" />
              <span className="text-sm text-gray-600">{t.rating} / 5</span>
            </>
          ) : (
            <span className="text-xs text-gray-400">No rating (added before star ratings)</span>
          )}
        </div>
        <p className="text-xs text-gray-500">
          {t.recipient_email
            ? `${t.recipient_email} · submitted ${date(t.submitted_at)}`
            : 'Carried over from the old website'}
          {t.status === 'published' && ` · live since ${date(t.published_at)}`}
        </p>
      </div>

      <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-400">
        Testimonial (as shown on the website)
      </label>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        rows={5}
        className={`${input} leading-relaxed`}
      />
      {differsFromOriginal && (
        <div className="mt-1">
          <button type="button" onClick={() => setShowOriginal((s) => !s)} className="text-xs text-gray-500 underline">
            {showOriginal ? 'Hide' : 'Show'} what the director originally wrote
          </button>
          {showOriginal && (
            <p className="mt-2 whitespace-pre-line rounded-lg bg-gray-50 p-3 text-sm text-gray-600">
              {t.original_comment}
            </p>
          )}
        </div>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-400">
            Director&apos;s name
          </label>
          <input value={name} onChange={(e) => setName(e.target.value)} className={input} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-400">Facility</label>
          <input value={facility} onChange={(e) => setFacility(e.target.value)} className={input} />
        </div>
      </div>
      <p className="mt-2 text-xs text-gray-400">
        Shown as:{' '}
        <span className="text-gray-600">
          {name || '…'}, Director, {facility || '…'}
        </span>
        . Fix spelling and grammar only. The star rating can&apos;t be changed.
      </p>

      <div className="mt-5 flex flex-wrap gap-2">
        {t.status !== 'published' && (
          <button
            disabled={busy}
            onClick={() => act(t.id, 'publish', fields, 'Published. It is now on the website.')}
            className={primary}
          >
            Publish
          </button>
        )}
        {t.status === 'pending' && (
          <button
            disabled={busy}
            onClick={() => act(t.id, 'unpublish', fields, 'Saved and kept off the website.')}
            className={secondary}
          >
            Keep unpublished
          </button>
        )}
        {edited && (
          <button
            disabled={busy}
            onClick={() =>
              act(t.id, 'save', fields, t.status === 'published' ? 'Saved. The website has been updated.' : 'Saved.')
            }
            className={t.status === 'published' ? primary : secondary}
          >
            Save changes
          </button>
        )}
        {t.status === 'published' && (
          <button
            disabled={busy}
            onClick={() => act(t.id, 'unpublish', fields, 'Unpublished. It has been taken off the website.')}
            className={secondary}
          >
            Unpublish
          </button>
        )}
      </div>
    </article>
  );
}

import type { Metadata } from 'next';

import { findRequestByToken } from '@/lib/testimonials/server';
import { COMMENT_MAX, COMMENT_MIN } from '@/lib/testimonials/shared';
import TestimonialForm from '@/components/testimonial-form';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Share your feedback · AfyaNzima',
  robots: { index: false, follow: false },
};

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="flex min-h-[70vh] items-center justify-center bg-gray-50 px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-gray-100 bg-white p-8 text-center shadow-sm">
        <h1 className="text-xl font-bold text-[#006CB5]">{title}</h1>
        <p className="mt-3 text-sm leading-relaxed text-gray-600">{children}</p>
      </div>
    </main>
  );
}

/** The page a facility director lands on from their testimonial request email. */
export default async function TestimonialPage({ params }: { params: { token: string } }) {
  const found = await findRequestByToken(params.token);

  if (found.state === 'done') {
    return (
      <Notice title="Thank you!">
        We&apos;ve already received your feedback through this link. We really appreciate you taking the time.
      </Notice>
    );
  }
  if (found.state === 'expired') {
    return (
      <Notice title="This link has expired">
        Please contact your AfyaNzima account manager or call 0719 807 978 and we&apos;ll send you a new one.
      </Notice>
    );
  }
  if (found.state !== 'open') {
    return (
      <Notice title="This link isn't valid">
        It may have been replaced by a newer email. Please use the most recent link we sent you, or call 0719 807 978.
      </Notice>
    );
  }

  const { row } = found;

  return (
    <main className="bg-gray-50 px-4 py-10 sm:py-16">
      <div className="mx-auto max-w-xl rounded-2xl border border-gray-100 bg-white p-6 shadow-sm sm:p-10">
        <p className="text-sm font-bold uppercase tracking-wide text-[#E63323]">{row.facility_name}</p>
        <h1 className="mt-2 text-2xl font-bold tracking-[-0.02em] text-[#006CB5] sm:text-3xl">
          How has your partnership with AfyaNzima been?
        </h1>
        <p className="mt-3 text-gray-600">Rate your experience so far and tell us about it in your own words.</p>
        <TestimonialForm
          token={params.token}
          defaultName={row.director_name ?? ''}
          facilityName={row.facility_name}
          minLength={COMMENT_MIN}
          maxLength={COMMENT_MAX}
        />
      </div>
    </main>
  );
}

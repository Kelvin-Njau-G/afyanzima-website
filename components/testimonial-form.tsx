'use client';

import { useState } from 'react';

import StarRatingInput from '@/components/star-rating';

export default function TestimonialForm({
  token,
  defaultName,
  facilityName,
  minLength,
  maxLength,
}: {
  token: string;
  defaultName: string;
  facilityName: string;
  minLength: number;
  maxLength: number;
}) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [name, setName] = useState(defaultName);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const length = comment.trim().length;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!rating) {
      setError('Please choose a star rating.');
      return;
    }
    if (length < minLength) {
      setError(`Please write at least ${minLength} characters about your experience.`);
      return;
    }
    setSending(true);
    setError('');
    try {
      const res = await fetch('/api/testimonials/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, rating, comment, directorName: name }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body?.error ?? 'Something went wrong. Please try again.');
        return;
      }
      setSent(true);
    } catch {
      setError('Something went wrong. Please check your connection and try again.');
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    return (
      <div className="mt-8 rounded-xl bg-[#F6F8FF] p-6 text-center">
        <p className="text-xl font-bold text-[#006CB5]">Thank you!</p>
        <p className="mt-2 text-gray-600">
          Your feedback has been sent to the AfyaNzima team. We really appreciate it.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mt-8 space-y-6">
      <StarRatingInput
        value={rating}
        onChange={(n) => {
          setRating(n);
          setError('');
        }}
      />

      <div>
        <label htmlFor="comment" className="mb-2 block text-sm font-bold text-gray-900">
          Tell us about your experience
        </label>
        <textarea
          id="comment"
          value={comment}
          onChange={(e) => {
            setComment(e.target.value.slice(0, maxLength));
            setError('');
          }}
          rows={8}
          maxLength={maxLength}
          placeholder="What has changed since partnering with AfyaNzima? What has worked well, and what could be better?"
          className="w-full rounded-lg border border-gray-200 px-4 py-3 leading-relaxed outline-none focus:border-[#006CB5]"
        />
        <p className={`mt-1 text-right text-xs ${length > maxLength - 100 ? 'text-[#E63323]' : 'text-gray-400'}`}>
          {length.toLocaleString()} / {maxLength.toLocaleString()} characters
        </p>
      </div>

      <div>
        <label htmlFor="name" className="mb-2 block text-sm font-bold text-gray-900">
          Your name
        </label>
        <input
          id="name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={100}
          required
          autoComplete="name"
          className="w-full rounded-lg border border-gray-200 px-4 py-2.5 outline-none focus:border-[#006CB5]"
        />
        <p className="mt-1 text-xs text-gray-500">Shown as: Director, {facilityName}</p>
      </div>

      <p className="text-xs leading-relaxed text-gray-500">
        By sending this, you agree that AfyaNzima may publish your comment, your name and your facility&apos;s name on
        our website. We may correct spelling and grammar, but won&apos;t change what you mean. Your star rating is for
        our team only.
      </p>

      {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      <button
        type="submit"
        disabled={sending}
        className="w-full rounded-full bg-[#006CB5] px-6 py-3 font-bold text-white disabled:opacity-50 sm:w-auto"
      >
        {sending ? 'Sending…' : 'Send feedback'}
      </button>
    </form>
  );
}

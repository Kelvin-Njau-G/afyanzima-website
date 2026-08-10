'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

type Step = 'email' | 'code';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next');

  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (step === 'code') codeRef.current?.focus();
  }, [step]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  async function requestCode(e?: React.FormEvent) {
    e?.preventDefault();
    setLoading(true);
    setError('');
    try {
      await fetch('/api/portal/request-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      // Always advances, whether or not the address is registered. An
      // unregistered address simply never receives a code.
      setStep('code');
      setResendIn(45);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/portal/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body?.error ?? 'That code is incorrect or has expired.');
        setCode('');
        return;
      }
      router.push(next && next.startsWith('/') ? next : body.redirect);
      router.refresh();
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-gray-100 bg-white p-8 shadow-sm">
        <div className="mb-6 text-center">
          <div className="mb-3 text-3xl">💊</div>
          <h1 className="text-lg font-medium text-gray-900">AfyaNzima Partner Portal</h1>
          <p className="mt-1 text-sm text-gray-500">
            {step === 'email'
              ? 'Sign in with your registered email to view your facility dashboard.'
              : `We've sent a 6-digit code to ${email} if that address is registered.`}
          </p>
        </div>

        {step === 'email' ? (
          <form onSubmit={requestCode} className="space-y-3">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@facility.com"
              autoComplete="email"
              autoFocus
              required
              className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-[#066DB7]"
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-[#066DB7] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {loading ? 'Sending…' : 'Send login code'}
            </button>
          </form>
        ) : (
          <form onSubmit={verifyCode} className="space-y-3">
            <input
              ref={codeRef}
              type="text"
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              placeholder="000000"
              autoComplete="one-time-code"
              required
              className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-center text-lg tracking-[0.4em] outline-none focus:border-[#066DB7]"
            />
            <button
              type="submit"
              disabled={loading || code.length !== 6}
              className="w-full rounded-lg bg-[#066DB7] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {loading ? 'Checking…' : 'Sign in'}
            </button>
            <div className="flex items-center justify-between pt-1 text-xs text-gray-500">
              <button
                type="button"
                onClick={() => {
                  setStep('email');
                  setCode('');
                  setError('');
                }}
                className="underline"
              >
                Use a different email
              </button>
              <button
                type="button"
                disabled={resendIn > 0 || loading}
                onClick={() => requestCode()}
                className="underline disabled:no-underline disabled:opacity-50"
              >
                {resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend code'}
              </button>
            </div>
          </form>
        )}

        {error && <p className="mt-3 text-center text-sm text-red-600">{error}</p>}

        <p className="mt-6 text-center text-xs text-gray-400">
          Accounts are created by AfyaNzima. Contact your account manager if you need access.
        </p>
      </div>
    </main>
  );
}

/**
 * useSearchParams() forces client-side rendering, so the form has to sit
 * behind a Suspense boundary or `next build` fails when prerendering.
 */
export default function PartnerPortalLogin() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-gray-50">
          <p className="text-sm text-gray-400">Loading…</p>
        </main>
      }
    >
      <LoginForm />
    </Suspense>
  );
}

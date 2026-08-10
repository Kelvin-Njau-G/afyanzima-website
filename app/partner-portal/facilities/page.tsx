'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

type Me = {
  email: string;
  fullName: string | null;
  role: 'partner' | 'admin';
  facilities: { slug: string; name: string }[];
};

export default function FacilityPicker() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/portal/me')
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data: Me) => {
        // One facility means there's nothing to choose — go straight there.
        if (data.role === 'partner' && data.facilities.length === 1) {
          router.replace(`/partner-facilities/${data.facilities[0].slug}`);
          return;
        }
        setMe(data);
        setLoading(false);
      })
      .catch(() => router.replace('/partner-portal'));
  }, [router]);

  async function signOut() {
    await fetch('/api/portal/logout', { method: 'POST' });
    router.replace('/partner-portal');
    router.refresh();
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50">
        <p className="text-sm text-gray-400">Loading…</p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md rounded-2xl border border-gray-100 bg-white p-8 shadow-sm">
        <h1 className="text-lg font-medium text-gray-900">Choose a facility</h1>
        <p className="mt-1 text-sm text-gray-500">Signed in as {me?.email}</p>

        {me?.facilities.length === 0 ? (
          <p className="mt-6 rounded-lg bg-amber-50 p-4 text-sm text-amber-800">
            Your account doesn&apos;t have access to any facility yet. Please contact your
            AfyaNzima account manager.
          </p>
        ) : (
          <ul className="mt-6 space-y-2">
            {me?.facilities.map((f) => (
              <li key={f.slug}>
                <Link
                  href={`/partner-facilities/${f.slug}`}
                  className="block rounded-lg border border-gray-200 px-4 py-3 text-sm font-medium text-gray-800 hover:border-[#066DB7] hover:text-[#066DB7]"
                >
                  {f.name}
                </Link>
              </li>
            ))}
          </ul>
        )}

        {me?.role === 'admin' && (
          <Link
            href="/admin"
            className="mt-4 block rounded-lg border border-dashed border-gray-300 px-4 py-3 text-center text-sm text-gray-600 hover:border-[#066DB7] hover:text-[#066DB7]"
          >
            Manage partner accounts
          </Link>
        )}

        <button
          onClick={signOut}
          className="mt-6 w-full text-center text-xs text-gray-400 underline"
        >
          Sign out
        </button>
      </div>
    </main>
  );
}

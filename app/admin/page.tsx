'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

type AdminUser = {
  id: string;
  email: string;
  full_name: string | null;
  role: 'partner' | 'admin';
  is_active: boolean;
  created_at: string;
  last_login_at: string | null;
  facilities: string[];
};

type Facility = { slug: string; name: string };

export default function AdminPortal() {
  const router = useRouter();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [allFacilities, setAllFacilities] = useState<Facility[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<'partner' | 'admin'>('partner');
  const [picked, setPicked] = useState<string[]>([]);

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/users');
    if (!res.ok) {
      router.replace('/partner-portal');
      return;
    }
    const data = await res.json();
    setUsers(data.users);
    setAllFacilities(data.allFacilities);
    setLoading(false);
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  function toggle(slug: string) {
    setPicked((p) => (p.includes(slug) ? p.filter((s) => s !== slug) : [...p, slug]));
  }

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, fullName, role, facilities: picked }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body?.error ?? 'Could not create the account.');
        return;
      }
      setEmail('');
      setFullName('');
      setRole('partner');
      setPicked([]);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function patch(id: string, changes: Record<string, unknown>) {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...changes }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body?.error ?? 'Could not update the account.');
        return;
      }
      await load();
    } finally {
      setBusy(false);
    }
  }

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
    <main className="min-h-screen bg-gray-50 px-4 py-10">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-medium text-gray-900">Partner accounts</h1>
            <p className="mt-1 text-sm text-gray-500">
              Create and manage who can sign in to the partner portal.
            </p>
          </div>
          <button onClick={signOut} className="text-xs text-gray-400 underline">
            Sign out
          </button>
        </div>

        {/* Create */}
        <section className="mb-10 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-sm font-medium text-gray-700">Add an account</h2>
          <form onSubmit={createUser} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Work email"
                required
                className="rounded-lg border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-[#066DB7]"
              />
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Full name (optional)"
                className="rounded-lg border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-[#066DB7]"
              />
            </div>

            <div className="flex gap-4 text-sm text-gray-700">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={role === 'partner'}
                  onChange={() => setRole('partner')}
                />
                Partner
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={role === 'admin'}
                  onChange={() => setRole('admin')}
                />
                Admin (sees every facility)
              </label>
            </div>

            {role === 'partner' && (
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">
                  Facility access
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {allFacilities.map((f) => (
                    <label
                      key={f.slug}
                      className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700"
                    >
                      <input
                        type="checkbox"
                        checked={picked.includes(f.slug)}
                        onChange={() => toggle(f.slug)}
                      />
                      {f.name}
                    </label>
                  ))}
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-[#066DB7] px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {busy ? 'Working…' : 'Create account'}
            </button>
            {error && <p className="text-sm text-red-600">{error}</p>}
          </form>
        </section>

        {/* List */}
        <section className="rounded-2xl border border-gray-100 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-400">
                <th className="px-6 py-3 font-medium">Account</th>
                <th className="px-6 py-3 font-medium">Access</th>
                <th className="px-6 py-3 font-medium">Last login</th>
                <th className="px-6 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-gray-50 last:border-0">
                  <td className="px-6 py-4">
                    <div className="font-medium text-gray-900">{u.full_name ?? u.email}</div>
                    <div className="text-xs text-gray-500">{u.email}</div>
                    {!u.is_active && (
                      <span className="mt-1 inline-block rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                        Deactivated
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-gray-600">
                    {u.role === 'admin' ? (
                      <span className="rounded bg-blue-50 px-2 py-0.5 text-xs text-[#066DB7]">
                        Admin — all facilities
                      </span>
                    ) : u.facilities.length ? (
                      u.facilities
                        .map((s) => allFacilities.find((f) => f.slug === s)?.name ?? s)
                        .join(', ')
                    ) : (
                      <span className="text-gray-400">None</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-xs text-gray-500">
                    {u.last_login_at
                      ? new Date(u.last_login_at).toLocaleDateString('en-GB', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })
                      : 'Never'}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      disabled={busy}
                      onClick={() => patch(u.id, { isActive: !u.is_active })}
                      className="text-xs text-gray-500 underline disabled:opacity-50"
                    >
                      {u.is_active ? 'Deactivate' : 'Reactivate'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <p className="mt-6 text-center text-xs text-gray-400">
          <Link href="/partner-portal/facilities" className="underline">
            Back to facilities
          </Link>
        </p>
      </div>
    </main>
  );
}

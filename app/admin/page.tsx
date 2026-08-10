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
type ManagedFacility = Facility & { is_active: boolean; userCount: number };

type Tab = 'accounts' | 'facilities';

/** Mirrors slugify() on the server so the preview matches what gets saved. */
function slugify(name: string) {
  return name
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export default function AdminPortal() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('accounts');

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [allFacilities, setAllFacilities] = useState<Facility[]>([]);
  const [managed, setManaged] = useState<ManagedFacility[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // New account form
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<'partner' | 'admin'>('partner');
  const [picked, setPicked] = useState<string[]>([]);

  // New facility form
  const [facilityName, setFacilityName] = useState('');
  const [facilitySlug, setFacilitySlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);

  const load = useCallback(async () => {
    const [usersRes, facilitiesRes] = await Promise.all([
      fetch('/api/admin/users'),
      fetch('/api/admin/facilities'),
    ]);
    if (!usersRes.ok) {
      router.replace('/partner-portal');
      return;
    }
    const usersData = await usersRes.json();
    setUsers(usersData.users);
    setAllFacilities(usersData.allFacilities);
    if (facilitiesRes.ok) setManaged((await facilitiesRes.json()).facilities);
    setLoading(false);
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  function toggle(slug: string) {
    setPicked((p) => (p.includes(slug) ? p.filter((s) => s !== slug) : [...p, slug]));
  }

  async function call(url: string, init: RequestInit, failure: string) {
    setBusy(true);
    setError('');
    try {
      const res = await fetch(url, init);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body?.error ?? failure);
        return false;
      }
      await load();
      return true;
    } finally {
      setBusy(false);
    }
  }

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    const ok = await call(
      '/api/admin/users',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, fullName, role, facilities: picked }),
      },
      'Could not create the account.',
    );
    if (ok) {
      setEmail('');
      setFullName('');
      setRole('partner');
      setPicked([]);
    }
  }

  async function createFacility(e: React.FormEvent) {
    e.preventDefault();
    const ok = await call(
      '/api/admin/facilities',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: facilityName, slug: facilitySlug || facilityName }),
      },
      'Could not add the facility.',
    );
    if (ok) {
      setFacilityName('');
      setFacilitySlug('');
      setSlugEdited(false);
    }
  }

  async function signOut() {
    await fetch('/api/portal/logout', { method: 'POST' });
    router.replace('/partner-portal');
    router.refresh();
  }

  if (loading) {
    return (
      <main className="flex min-h-[70vh] items-center justify-center bg-gray-50">
        <p className="text-sm text-gray-400">Loading…</p>
      </main>
    );
  }

  const previewSlug = slugify(facilitySlug || facilityName);

  return (
    <main className="min-h-[70vh] bg-gray-50 px-4 py-10">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-medium text-gray-900">Portal administration</h1>
            <p className="mt-1 text-sm text-gray-500">
              Manage who can sign in, and which facilities they can see.
            </p>
          </div>
          <button onClick={signOut} className="text-xs text-gray-400 underline">
            Sign out
          </button>
        </div>

        <div className="mb-8 flex gap-1 border-b border-gray-200 text-sm">
          {(['accounts', 'facilities'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`-mb-px border-b-2 px-4 py-2 capitalize ${
                tab === t
                  ? 'border-[#066DB7] font-medium text-[#066DB7]'
                  : 'border-transparent text-gray-500'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {error && (
          <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
        )}

        {tab === 'accounts' ? (
          <>
            <section className="mb-10 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-sm font-medium text-gray-700">Add an account</h2>
              <form onSubmit={createUser} className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Registered email"
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
                    {allFacilities.length === 0 ? (
                      <p className="text-sm text-gray-500">
                        No facilities yet — add one on the Facilities tab first.
                      </p>
                    ) : (
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
                    )}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={busy}
                  className="rounded-lg bg-[#066DB7] px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50"
                >
                  {busy ? 'Working…' : 'Create account'}
                </button>
              </form>
            </section>

            <section className="overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-sm">
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
                          onClick={() =>
                            call(
                              '/api/admin/users',
                              {
                                method: 'PATCH',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ id: u.id, isActive: !u.is_active }),
                              },
                              'Could not update the account.',
                            )
                          }
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
          </>
        ) : (
          <>
            <section className="mb-10 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
              <h2 className="mb-1 text-sm font-medium text-gray-700">Add a facility</h2>
              <p className="mb-4 text-xs leading-relaxed text-gray-500">
                The name must match the facility name in your Metabase data exactly — it&apos;s
                what the dashboard query filters on. A mismatch produces an empty dashboard
                rather than an error, so copy it across rather than retyping it.
              </p>
              <form onSubmit={createFacility} className="space-y-4">
                <input
                  type="text"
                  value={facilityName}
                  onChange={(e) => {
                    setFacilityName(e.target.value);
                    if (!slugEdited) setFacilitySlug(slugify(e.target.value));
                  }}
                  placeholder="Facility name, e.g. St Mary's Medical Centre"
                  required
                  className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-[#066DB7]"
                />
                <div>
                  <input
                    type="text"
                    value={facilitySlug}
                    onChange={(e) => {
                      setSlugEdited(true);
                      setFacilitySlug(e.target.value);
                    }}
                    placeholder="dashboard-url"
                    className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-[#066DB7]"
                  />
                  <p className="mt-1.5 text-xs text-gray-400">
                    Dashboard will live at /partner-facilities/
                    <span className="font-medium text-gray-600">{previewSlug || '…'}</span>. This
                    can&apos;t be changed later without breaking saved links.
                  </p>
                </div>
                <button
                  type="submit"
                  disabled={busy || !facilityName.trim()}
                  className="rounded-lg bg-[#066DB7] px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50"
                >
                  {busy ? 'Working…' : 'Add facility'}
                </button>
              </form>
            </section>

            <section className="overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-sm">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-400">
                    <th className="px-6 py-3 font-medium">Facility</th>
                    <th className="px-6 py-3 font-medium">Accounts</th>
                    <th className="px-6 py-3 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {managed.map((f) => (
                    <tr key={f.slug} className="border-b border-gray-50 last:border-0">
                      <td className="px-6 py-4">
                        <div className="font-medium text-gray-900">{f.name}</div>
                        <div className="text-xs text-gray-500">/partner-facilities/{f.slug}</div>
                        {!f.is_active && (
                          <span className="mt-1 inline-block rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                            Hidden
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-gray-600">
                        {f.userCount === 0 ? (
                          <span className="text-gray-400">None</span>
                        ) : (
                          `${f.userCount} account${f.userCount === 1 ? '' : 's'}`
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          disabled={busy}
                          onClick={() =>
                            call(
                              '/api/admin/facilities',
                              {
                                method: 'PATCH',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ slug: f.slug, isActive: !f.is_active }),
                              },
                              'Could not update the facility.',
                            )
                          }
                          className="text-xs text-gray-500 underline disabled:opacity-50"
                        >
                          {f.is_active ? 'Hide' : 'Unhide'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <p className="mt-4 text-xs leading-relaxed text-gray-400">
              Hiding a facility removes it from the portal without touching anything else, which
              is almost always what you want. Permanent deletion exists in the API but is
              deliberately not exposed here — it also wipes every account&apos;s access to that
              facility, with no undo.
            </p>
          </>
        )}

        <p className="mt-8 text-center text-xs text-gray-400">
          <Link href="/partner-portal/facilities" className="underline">
            Back to facilities
          </Link>
        </p>
      </div>
    </main>
  );
}

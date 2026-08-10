'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Bars3Icon, XMarkIcon } from '@heroicons/react/24/outline';

import Logo from '@/images/logo.png';

type Me = {
  email: string;
  role: 'partner' | 'admin';
  facilities: { slug: string; name: string }[];
};

/**
 * Portal pages where we should check for a session and show sign-out.
 * Everywhere else (the marketing site) skips the request entirely, so public
 * visitors never trigger a database lookup just by loading the homepage.
 */
const PORTAL_PREFIXES = ['/partner-facilities', '/admin', '/partner-portal/facilities'];

export default function Nav() {
  const [isOpen, setIsOpen] = useState(false);
  const [me, setMe] = useState<Me | null>(null);
  const pathname = usePathname();
  const router = useRouter();

  const onPortalPage = PORTAL_PREFIXES.some((p) => pathname?.startsWith(p));

  useEffect(() => {
    if (!onPortalPage) {
      setMe(null);
      return;
    }
    let cancelled = false;
    fetch('/api/portal/me')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled) setMe(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [onPortalPage, pathname]);

  async function signOut() {
    await fetch('/api/portal/logout', { method: 'POST' });
    setMe(null);
    setIsOpen(false);
    router.push('/partner-portal');
    router.refresh();
  }

  // Section links point at "/#id" rather than "#id" so they work from any
  // page. A bare "#patients" does nothing on /partner-facilities/... because
  // there's no such element there — it has to navigate home first.
  const sectionLinks = [
    { href: '/#pharmacies', label: 'For Patients' },
    { href: '/#patients', label: 'For Providers' },
  ];

  const showSwitcher = !!me && (me.role === 'admin' || me.facilities.length > 1);

  return (
    <>
      <header className="sticky top-0 z-10 h-14 bg-white text-[#066DB7]">
        <div className="mx-auto flex max-w-screen-2xl items-center justify-between px-4 py-2 sm:px-16">
          <div className="flex items-center space-x-10">
            <Link href="/" className="w-[6.5rem] shrink-0 sm:w-[7.25rem]">
              <Image src={Logo} alt="AfyaNzima home" priority quality={100} />
            </Link>
            <nav className="flex items-center space-x-8 text-sm font-bold max-sm:hidden">
              {sectionLinks.map((l) => (
                <Link key={l.href} href={l.href}>
                  {l.label}
                </Link>
              ))}
              {me ? (
                <>
                  {showSwitcher && <Link href="/partner-portal/facilities">My Dashboards</Link>}
                  {me.role === 'admin' && <Link href="/admin">Admin</Link>}
                </>
              ) : (
                <Link href="/partner-portal">Partner Portal</Link>
              )}
            </nav>
          </div>

          <div className="flex items-center gap-4">
            {me && (
              <div className="flex items-center gap-3 text-sm max-sm:hidden">
                <span className="max-w-[14rem] truncate text-xs text-gray-500">{me.email}</span>
                <button onClick={signOut} className="font-bold text-[#066DB7] underline">
                  Sign out
                </button>
              </div>
            )}
            <button onClick={() => setIsOpen(true)} className="sm:hidden">
              <Bars3Icon className="size-6" />
              <span className="sr-only">Menu</span>
            </button>
          </div>
        </div>
      </header>

      <aside className={`fixed inset-0 z-20 sm:hidden ${!isOpen ? 'invisible' : ''}`}>
        <div className="bg-white">
          <div className="flex items-center justify-between px-4 py-2 sm:px-16">
            <div className="flex items-center space-x-16">
              <div className="w-[6.5rem] sm:w-[7.25rem]">
                <Image src={Logo} alt="logo" priority quality={100} />
              </div>
            </div>
            <button onClick={() => setIsOpen(false)} className="sm:hidden">
              <XMarkIcon className="size-6 text-[#066DB7]" />
              <span className="sr-only">Close Menu</span>
            </button>
          </div>
          <nav className="space-y-6 px-6 py-8 text-center text-lg/5 font-bold text-[#066DB7]">
            <div className="flex flex-col space-y-6">
              {sectionLinks.map((l) => (
                <Link key={l.href} href={l.href} onClick={() => setIsOpen(false)}>
                  {l.label}
                </Link>
              ))}
              {me ? (
                <>
                  {showSwitcher && (
                    <Link href="/partner-portal/facilities" onClick={() => setIsOpen(false)}>
                      My Dashboards
                    </Link>
                  )}
                  {me.role === 'admin' && (
                    <Link href="/admin" onClick={() => setIsOpen(false)}>
                      Admin
                    </Link>
                  )}
                  <button onClick={signOut} className="font-bold text-[#066DB7] underline">
                    Sign out
                  </button>
                  <span className="text-sm font-normal text-gray-500">{me.email}</span>
                </>
              ) : (
                <Link href="/partner-portal" onClick={() => setIsOpen(false)}>
                  Partner Portal
                </Link>
              )}
            </div>
          </nav>
        </div>
      </aside>
    </>
  );
}

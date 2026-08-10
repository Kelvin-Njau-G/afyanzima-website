import { NextResponse, type NextRequest } from 'next/server';
import { readSessionToken, SESSION_COOKIE } from '@/lib/portal/session';

/**
 * First line of defence: keeps unauthenticated visitors off portal pages.
 *
 * This is NOT the only check. The real one lives in the API routes, which
 * verify against the database that this specific user may see this specific
 * facility. Middleware protects the page; the API protects the data. A
 * hand-written POST to /api/dashboard/<other-facility> still gets a 401 even
 * though it never passes through here.
 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const session = await readSessionToken(req.cookies.get(SESSION_COOKIE)?.value);

  if (pathname.startsWith('/admin')) {
    if (!session || session.role !== 'admin') {
      const url = req.nextUrl.clone();
      url.pathname = '/partner-portal';
      url.searchParams.set('next', pathname);
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  if (pathname.startsWith('/partner-facilities')) {
    if (session) return NextResponse.next();

    // During the transition, unauthenticated visitors still reach the legacy
    // password form. Set PORTAL_LEGACY_PASSWORDS=false to close that door —
    // no code change needed, just flip the env var and redeploy.
    if (process.env.PORTAL_LEGACY_PASSWORDS !== 'false') {
      return NextResponse.next();
    }

    const url = req.nextUrl.clone();
    url.pathname = '/partner-portal';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/partner-facilities/:path*'],
};

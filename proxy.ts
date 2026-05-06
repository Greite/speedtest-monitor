import { NextResponse } from 'next/server';
import { apiError } from '@/lib/api-errors';
import { auth } from '@/lib/auth/handler';
import { countUsers } from '@/lib/auth/users';

export default auth(async (req) => {
  const { pathname } = req.nextUrl;
  const session = req.auth;

  if (
    (pathname.startsWith('/api/auth/') && !pathname.startsWith('/api/auth/setup')) ||
    pathname === '/api/health' ||
    pathname.startsWith('/_next/') ||
    pathname === '/favicon.ico' ||
    pathname === '/icon.svg' ||
    pathname === '/apple-icon' ||
    pathname.startsWith('/icon-') ||
    pathname.startsWith('/apple-icon-') ||
    pathname.startsWith('/icons/')
  ) {
    return NextResponse.next();
  }

  const noUsers = countUsers() === 0;

  if (pathname === '/setup' || pathname === '/api/auth/setup') {
    if (noUsers) return NextResponse.next();
    if (pathname.startsWith('/api/')) {
      return apiError('not_found', 'Setup is no longer available.', 404);
    }
    return NextResponse.redirect(new URL('/login', req.nextUrl));
  }

  if (pathname === '/login') {
    if (noUsers) return NextResponse.redirect(new URL('/setup', req.nextUrl));
    if (session?.user) return NextResponse.redirect(new URL('/', req.nextUrl));
    return NextResponse.next();
  }

  if (!session?.user) {
    if (noUsers) {
      if (pathname.startsWith('/api/')) {
        return apiError('setup_required', 'Initial setup is required.', 503);
      }
      return NextResponse.redirect(new URL('/setup', req.nextUrl));
    }
    if (pathname.startsWith('/api/')) {
      return apiError('unauthorized', 'You must be signed in.', 401);
    }
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(url);
  }

  const role = session.user.role;
  const isMutation = req.method !== 'GET' && req.method !== 'HEAD';
  const isUsersApi = pathname.startsWith('/api/users');
  const isAlertsTest = pathname === '/api/alerts/test';

  if (role !== 'admin' && (isMutation || isUsersApi || isAlertsTest)) {
    if (pathname.startsWith('/api/')) {
      return apiError('forbidden', 'You do not have permission.', 403);
    }
    return NextResponse.redirect(new URL('/', req.nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon|icon-|apple-icon-|icons/).*)',
  ],
};

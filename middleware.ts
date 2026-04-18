import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth/handler';
import { countUsers } from '@/lib/auth/users';

export default auth(async (req) => {
  const { pathname } = req.nextUrl;
  const session = req.auth;

  if (
    (pathname.startsWith('/api/auth/') && !pathname.startsWith('/api/auth/setup')) ||
    pathname.startsWith('/_next/') ||
    pathname === '/favicon.ico' ||
    pathname.startsWith('/icons/')
  ) {
    return NextResponse.next();
  }

  const noUsers = countUsers() === 0;

  if (pathname === '/setup' || pathname === '/api/auth/setup') {
    if (noUsers) return NextResponse.next();
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'not found' }, { status: 404 });
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
        return NextResponse.json({ error: 'setup required' }, { status: 503 });
      }
      return NextResponse.redirect(new URL('/setup', req.nextUrl));
    }
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
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
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
    return NextResponse.redirect(new URL('/', req.nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icons/).*)'],
  runtime: 'nodejs',
};

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const [AUTH_USER, AUTH_PASS] = (process.env.ADMIN_CREDENTIALS || ':').split(':');

// Step 1. HTTP Basic Auth Proxy for Challenge
export function proxy(req: NextRequest) {
  console.log('Proxy triggered for:', req.nextUrl.pathname);
  console.log('Checking basic auth for:', req.nextUrl.pathname);

  if (!isAuthenticated(req)) {
    console.log('Authentication failed for:', req.nextUrl.pathname);
    return new NextResponse('Authentication required', {
      status: 401,
      headers: { 'WWW-Authenticate': 'Basic' },
    });
  }

  return NextResponse.next();
}

// Step 2. Check HTTP Basic Auth header if present
function isAuthenticated(req: NextRequest) {
  const authheader = req.headers.get('authorization') || req.headers.get('Authorization');

  if (!authheader) {
    return false;
  }

  const auth = Buffer.from(authheader.split(' ')[1], 'base64').toString().split(':');
  const user = auth[0];
  const pass = auth[1];

  if (user == AUTH_USER && pass == AUTH_PASS) {
    return true;
  } else {
    return false;
  }
}

// Step 3. Configure "Matching Paths" below to protect routes with HTTP Basic Auth
export const config = {
  matcher: ['/admin/:path*', '/stats/:path*', '/api/admin/:path*'],
};

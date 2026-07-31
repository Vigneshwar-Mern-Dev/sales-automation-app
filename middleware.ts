import { NextRequest, NextResponse } from "next/server";

/**
 * Global route protection middleware.
 *
 * Routes:
 *   /admin/*         → requires session cookie (redirects to /login)
 *   /user/*          → requires session cookie (redirects to /login)
 *   /api/calls/*     → requires session cookie (returns 401 JSON)
 *   /api/user/*      → requires session cookie (returns 401 JSON)
 *   /api/call-leads/* → requires session cookie (returns 401 JSON)
 *   /api/sync-lead/* → requires session cookie (returns 401 JSON)
 *   /api/sync-leads/*→ requires session cookie (returns 401 JSON)
 *
 * Public routes (no cookie check):
 *   /                → landing page
 *   /login, /register → auth pages
 *   /f/*             → public customer form
 *   /atm-franchise/* → public customer form (rewrite)
 *   /apply/*         → public customer form (rewrite)
 *   /api/call-tracker/* → device token auth (handled in route)
 *   /api/whatsapp/*  → bridge token auth (handled in route)
 *   /_next/*, /favicon.ico → static assets
 *
 * Note: This middleware only checks for cookie _presence_, not validity.
 * Actual session validation (signature, expiry, user lookup) is still done
 * in the route handlers. This layer just blocks obviously unauthenticated
 * requests early.
 */

const SESSION_COOKIE = "crm_session";

/** Dashboard page routes that require authentication. */
const PROTECTED_PAGE_PREFIXES = ["/admin", "/user"];

/** API routes that require session-cookie authentication. */
const PROTECTED_API_PREFIXES = [
  "/api/calls",
  "/api/call-leads",
  "/api/user",
  "/api/sync-lead",
  "/api/sync-leads",
];

function isProtectedPage(pathname: string) {
  return PROTECTED_PAGE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function isProtectedApi(pathname: string) {
  return PROTECTED_API_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = request.cookies.has(SESSION_COOKIE);

  // Protected dashboard pages → redirect to login
  if (isProtectedPage(pathname) && !hasSession) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Protected API routes → 401 JSON
  if (isProtectedApi(pathname) && !hasSession) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico, robots.txt, sitemap.xml
     */
    "/((?!_next/static|_next/image|favicon\\.ico|robots\\.txt|sitemap\\.xml).*)",
  ],
};

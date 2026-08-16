import { NextResponse, type NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/proxy";

/**
 * Path prefixes that require a session to even attempt rendering. This is
 * an optimistic, JWT-claims-only check (no database query) -- the real
 * authorization boundary is still enforced server-side per page (e.g.
 * app/dashboard/page.tsx via lib/auth/context.ts) and, underneath that, by
 * RLS. Everything not listed here -- /, /feedback, /login, /signup,
 * /forgot-password, /reset-password, /auth/confirm -- stays reachable
 * without a session.
 */
const PROTECTED_PREFIXES = ["/dashboard"];

export async function proxy(request: NextRequest) {
  const { response, isAuthenticated } = await updateSession(request);

  const { pathname } = request.nextUrl;
  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  if (isProtected && !isAuthenticated) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Run on everything except static assets and image optimization files --
     * those never touch a Supabase session.
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};

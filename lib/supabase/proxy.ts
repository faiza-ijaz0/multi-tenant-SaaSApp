import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export interface SessionRefreshResult {
  response: NextResponse;
  isAuthenticated: boolean;
}

/**
 * Refreshes the Supabase session cookie on every request. Required because
 * Server Components can't write cookies themselves -- without this, an
 * expired-but-refreshable access token never gets refreshed and users get
 * randomly signed out.
 *
 * Also reports whether the request is authenticated, via the same
 * getClaims() call already needed for the refresh (see the comment below on
 * why nothing else may run between creating the client and calling it) --
 * so the root proxy.ts can make coarse, optimistic protected-route
 * decisions without a second round trip. This is intentionally the *only*
 * thing proxy-level auth checks do: no database queries, no RLS-equivalent
 * logic -- the real authorization boundary stays server-side, close to the
 * data (lib/auth/context.ts), same as Phase 2. See root proxy.ts for which
 * paths this actually gates.
 */
export async function updateSession(request: NextRequest): Promise<SessionRefreshResult> {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Do not run code between createServerClient and getClaims() -- a stray
  // await here can prevent the token refresh from completing before the
  // response is returned, causing intermittent, hard-to-debug sign-outs.
  const { data } = await supabase.auth.getClaims();

  return { response: supabaseResponse, isAuthenticated: Boolean(data?.claims?.sub) };
}

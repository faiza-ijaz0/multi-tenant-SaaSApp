import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Server Supabase client for Server Components, Server Actions, and Route
 * Handlers. Reads the session from request cookies -- never accepts a
 * user/profile id as a parameter, since identity always comes from the
 * cookie-derived session, verified via `supabase.auth.getClaims()` by
 * callers (see lib/auth/user.ts), never trusted as-is.
 *
 * `setAll` is a no-op (caught) when called from a Server Component, which
 * can't write cookies -- session refresh in that case is handled by
 * proxy.ts (lib/supabase/proxy.ts).
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component -- ignored; proxy.ts refreshes
            // the session on the next request instead.
          }
        },
      },
    },
  );
}

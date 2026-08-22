import type { SupabaseClient } from "@supabase/supabase-js";

import { UnauthenticatedError } from "./errors";
import type { AuthenticatedUserContext } from "./types";

/**
 * Resolves the authenticated user from a verified Supabase Auth session.
 *
 * Uses `getClaims()`, not `getSession()`: the session object read from
 * cookie/local storage can be spoofed by the client and must never be
 * trusted directly for authorization. `getClaims()` verifies the JWT
 * signature (locally, against the project's published keys, or via the Auth
 * server when the project doesn't use asymmetric signing keys) every call --
 * see https://supabase.com/docs/guides/auth/sessions.
 *
 * Accepts any authenticated SupabaseClient (SSR cookie-based in the app,
 * or a plain signed-in client in tests) -- this function never constructs
 * its own client and never reads a user id from anywhere but the verified
 * token.
 */
export async function getAuthenticatedUser(
  supabase: SupabaseClient,
): Promise<AuthenticatedUserContext> {
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims?.sub) {
    throw new UnauthenticatedError();
  }

  const metadata = data.claims.user_metadata;
  const fullName =
    metadata && typeof metadata === "object" && "full_name" in metadata && typeof metadata.full_name === "string"
      ? metadata.full_name
      : null;

  return {
    id: data.claims.sub,
    email: typeof data.claims.email === "string" ? data.claims.email : null,
    fullName,
  };
}

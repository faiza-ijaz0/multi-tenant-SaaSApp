import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client -- bypasses RLS entirely and can call the
 * Auth Admin API (create/update/delete auth.users directly, including
 * setting a password). Not guarded by the `server-only` package (not an
 * existing dependency of this project, and avoidable here without one --
 * see below) -- safety instead comes from: this module only ever being
 * imported by "use server" action files (never a Client Component, checked
 * at every call site), and SUPABASE_SERVICE_ROLE_KEY deliberately having no
 * NEXT_PUBLIC_ prefix, so Next.js's bundler never inlines it into client
 * code even by accident -- reading it from a Client Component would just be
 * undefined, not a leaked value.
 *

 * ONLY use this for the operations that structurally require it and
 * cannot be reached any other way:
 *   - creating an auth.users row with an admin-chosen password
 *     (features/members/create-account.ts) -- no RLS-respecting client can
 *     ever do this; it's exactly what the Auth Admin API exists for.
 *   - changing another user's email (features/members/update-account.ts)
 *     -- same reasoning, auth.users.email is never reachable from a plain
 *     SQL RPC.
 *   - setting another member's password directly
 *     (features/members/change-password.ts) -- same reasoning as email.
 *
 * Every other mutation in this app goes through the caller's own
 * authenticated client (lib/supabase/server.ts) so RLS -- the actual
 * authorization boundary everywhere else in this codebase -- still
 * applies. Do NOT reach for this client as a shortcut around RLS for
 * anything else; every call site using it must independently re-derive
 * and check the caller's real permissions first (see the two files above
 * for the pattern: an RLS-respecting call to a SECURITY DEFINER RPC that
 * does its own authorization runs BEFORE the service-role call, and the
 * service-role call only proceeds if that succeeds).
 */
export function createServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not configured -- required for admin-only account operations.",
    );
  }

  return createSupabaseClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

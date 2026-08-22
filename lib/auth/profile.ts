import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Ensures a profiles row exists for the authenticated user. Nothing in the
 * auth flow creates one automatically yet (see 0001_initial_schema.sql's
 * own comment on this -- the auth.users trigger is explicitly a
 * later-phase concern), and several tables FK straight to profiles.id
 * (memberships, customers, comments, ...), so this is a real prerequisite
 * wherever one of those inserts can be a user's first write, not
 * defensive padding. Idempotent via profiles_insert_own + ignoreDuplicates.
 */
export async function ensureProfileExists(supabase: SupabaseClient, userId: string): Promise<void> {
  const { error } = await supabase
    .from("profiles")
    .upsert({ id: userId }, { onConflict: "id", ignoreDuplicates: true });
  if (error) {
    throw new Error(`Failed to prepare profile: ${error.message}`);
  }
}

/**
 * Same idempotent guarantee as ensureProfileExists, plus best-effort
 * backfill of full_name from the caller's own JWT user_metadata (see
 * AuthenticatedUserContext.fullName) -- for the customer signup flow, where
 * email confirmation can mean the first authenticated request that's able
 * to write a profiles row (RLS requires `to authenticated`) happens well
 * after signUp() itself returned. A plain upsert(..., ignoreDuplicates)
 * can't backfill an existing-but-nameless row (Postgres "on conflict do
 * nothing" skips the row entirely), so this does a real select-then-write
 * instead: insert (race-safe via the same ignoreDuplicates upsert) when no
 * row exists yet, or a targeted update only when the existing row's
 * full_name is still empty. Never overwrites a name the row already has.
 */
export async function ensureProfileWithName(
  supabase: SupabaseClient,
  userId: string,
  fullName?: string | null,
): Promise<void> {
  const trimmedName = fullName?.trim() || null;

  const { data: existing, error: selectError } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", userId)
    .maybeSingle();
  if (selectError) {
    throw new Error(`Failed to load profile: ${selectError.message}`);
  }

  if (!existing) {
    const { error: insertError } = await supabase
      .from("profiles")
      .upsert({ id: userId, full_name: trimmedName }, { onConflict: "id", ignoreDuplicates: true });
    if (insertError) {
      throw new Error(`Failed to prepare profile: ${insertError.message}`);
    }
    return;
  }

  if (!existing.full_name && trimmedName) {
    const { error: updateError } = await supabase
      .from("profiles")
      .update({ full_name: trimmedName })
      .eq("id", userId);
    if (updateError) {
      throw new Error(`Failed to update profile: ${updateError.message}`);
    }
  }
}

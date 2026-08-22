import type { SupabaseClient } from "@supabase/supabase-js";

import { ensureProfileWithName } from "@/lib/auth/profile";

/**
 * Self-registers the authenticated user as a customer of an organization,
 * if they aren't already a member or customer of it -- the prerequisite
 * submissions_insert_member_or_customer checks via has_organization_access.
 * Safe to call unconditionally: customers_org_profile_unique + ignoreDuplicates
 * makes this a no-op if the row already exists. Backed by
 * customers_insert_self_or_admin's `profile_id = auth.uid()` branch --
 * a caller can only ever register *themselves*, for whatever organization's
 * portal they can already see (RLS on the calling context, not this helper,
 * governs which organizations that includes).
 *
 * `fullName` (from AuthenticatedUserContext.fullName, the customer signup
 * flow's JWT user_metadata) is a best-effort profile backfill only -- never
 * required, never authorization-relevant.
 */
export async function ensureCustomerOfOrganization(
  supabase: SupabaseClient,
  userId: string,
  organizationId: string,
  email: string,
  fullName?: string | null,
): Promise<void> {
  await ensureProfileWithName(supabase, userId, fullName);

  const { error } = await supabase
    .from("customers")
    .upsert(
      { organization_id: organizationId, profile_id: userId, email },
      { onConflict: "organization_id,profile_id", ignoreDuplicates: true },
    );
  if (error) {
    throw new Error(`Failed to register as a portal customer: ${error.message}`);
  }
}

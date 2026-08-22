import type { SupabaseClient } from "@supabase/supabase-js";

import { getAuthenticatedUser } from "@/lib/auth/user";
import type { AuthenticatedUserContext } from "@/lib/auth/types";

/**
 * Shown whenever an authenticated Supabase account is rejected from the
 * customer portal for a specific organization -- deliberately generic:
 * never names "RLS", a table, a membership role, or any other
 * organization detail, so it can't be used to probe whether the account
 * happens to be internal staff somewhere.
 */
export const NOT_A_CUSTOMER_MESSAGE =
  "This account is an organization account and can't be used for the customer feedback portal. Please use a customer account.";

/**
 * THE authorization boundary this file exists to enforce (Phase 4): a
 * valid Supabase Auth session alone is never sufficient proof that the
 * caller is a legitimate external customer of `organizationId`. The two
 * tables that already fully capture this relationship are `customers`
 * (a real, explicit customer registration -- customers_select_self_or_admin)
 * and `memberships` (internal owner/admin/member -- memberships_select_member).
 * No new role/table is introduced; this only composes the two that already
 * exist:
 *
 *   - A real `customers` row for (organizationId, userId) always wins --
 *     if this account was ever legitimately registered as a customer of
 *     this specific organization (self-registration on first submission,
 *     or an admin adding them), that stands regardless of any internal
 *     membership the same person might also hold, here or elsewhere
 *     (Phase 4 spec: "Owner of Org A AND Customer of Org B" must still get
 *     Org B customer access).
 *   - Otherwise, the account is eligible only if it holds NO internal
 *     membership in this exact organization. An owner/admin/member of
 *     *this* org has never been through customer registration and must
 *     not be silently treated as one just because the same Supabase Auth
 *     account can authenticate -- that was the Phase 4 bug.
 *
 * Both lookups run through the caller's own authenticated client (the same
 * one used everywhere else in the portal), never a service-role client:
 * RLS (memberships_select_member / customers_select_self_or_admin) already
 * scopes each query to rows this exact caller could see, and since both
 * queries additionally filter on `profile_id = userId` themselves, the
 * only row either can ever return is the caller's own -- there is no way
 * for this check to read or leak another user's membership/customer status.
 */
export async function isEligibleCustomerForOrganization(
  supabase: SupabaseClient,
  userId: string,
  organizationId: string,
): Promise<boolean> {
  const { data: customerRow, error: customerError } = await supabase
    .from("customers")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("profile_id", userId)
    .maybeSingle();
  if (customerError) {
    throw new Error(`Failed to resolve customer eligibility: ${customerError.message}`);
  }
  if (customerRow) return true;

  const { data: membershipRow, error: membershipError } = await supabase
    .from("memberships")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("profile_id", userId)
    .maybeSingle();
  if (membershipError) {
    throw new Error(`Failed to resolve customer eligibility: ${membershipError.message}`);
  }
  return !membershipRow;
}

/**
 * The drop-in replacement for `getCurrentUser().catch(() => null)` /
 * `getAuthenticatedUser(supabase).catch(() => null)` throughout
 * /feedback/[slug]/* -- resolves to the real authenticated identity only
 * when that identity is actually eligible to use *this organization's*
 * customer portal. An authenticated-but-ineligible visitor (an internal
 * member of this exact org, with no customer relationship here) resolves
 * to null, i.e. is treated identically to an anonymous visitor by every
 * page and component that reads this value -- they keep read access to a
 * public portal (unchanged, existing behavior) but never see the
 * customer-only account menu, "Share Feedback" CTA, or My Feedback/Profile
 * pages, and are never silently auto-registered as a customer.
 */
export async function resolveCustomerIdentity(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<AuthenticatedUserContext | null> {
  let user: AuthenticatedUserContext;
  try {
    user = await getAuthenticatedUser(supabase);
  } catch {
    return null;
  }

  const eligible = await isEligibleCustomerForOrganization(supabase, user.id, organizationId);
  return eligible ? user : null;
}

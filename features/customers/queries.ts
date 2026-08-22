import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * This customer's own `customers` row for one organization -- their
 * registration date with this specific portal, for the profile page's
 * "customer since" line. customers_select_self_or_admin scopes this to the
 * caller's own row (or an org admin's), so organizationId/userId here only
 * ever narrow an already-self-scoped read, never broaden it.
 */
export async function getCustomerMembership(
  supabase: SupabaseClient,
  organizationId: string,
  userId: string,
): Promise<{ createdAt: string } | null> {
  const { data, error } = await supabase
    .from("customers")
    .select("created_at")
    .eq("organization_id", organizationId)
    .eq("profile_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load customer record: ${error.message}`);
  }
  if (!data) return null;
  return { createdAt: data.created_at as string };
}

export interface RecentCustomerPortal {
  organizationId: string;
  organizationName: string;
  slug: string;
  brandName: string | null;
}

interface CustomerOrgRow {
  organization_id: string;
  created_at: string;
  organizations: { name: string } | { name: string }[] | null;
}

function first<T>(value: T | T[] | null): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

/**
 * The organizations `userId` is already a registered portal customer of,
 * most-recent first, for the "recent portals" convenience list on the
 * portal-connect page (/feedback/portal) -- never a directory of every
 * organization, only ones this specific customer already has a real,
 * RLS-verified relationship with (customers_select_self_or_admin: `profile_id
 * = auth.uid()`).
 *
 * A slug is only returned for organizations whose portal_settings row this
 * caller can actually see (portal_settings_select_member_or_public: member
 * or is_public = true -- see that policy's comment in
 * 0003_rls_policies.sql). That policy has no branch for
 * is_organization_customer, so a customer of a private (non-public) portal
 * they aren't also a team member of will have their portal_settings lookup
 * come back empty here -- entries without a resolvable slug are dropped
 * rather than shown as a dead link. This is a real, pre-existing schema
 * gap (not introduced by this function): a customer's own portal_settings
 * visibility doesn't yet extend to portals they only have a customer
 * relationship with. Flagged in the Phase 2 report rather than patched here
 * -- fixing it is an RLS/migration change, out of scope for this feature.
 */
export async function listRecentCustomerPortals(
  supabase: SupabaseClient,
  userId: string,
  limit = 5,
): Promise<RecentCustomerPortal[]> {
  const { data: customerRows, error: customerError } = await supabase
    .from("customers")
    .select("organization_id, created_at, organizations(name)")
    .eq("profile_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit)
    .returns<CustomerOrgRow[]>();

  if (customerError) {
    throw new Error(`Failed to load recent portals: ${customerError.message}`);
  }
  if (!customerRows || customerRows.length === 0) return [];

  const organizationIds = customerRows.map((row) => row.organization_id);
  const { data: portalRows, error: portalError } = await supabase
    .from("portal_settings")
    .select("organization_id, slug, brand_name")
    .in("organization_id", organizationIds);

  if (portalError) {
    throw new Error(`Failed to load recent portals: ${portalError.message}`);
  }

  const slugByOrgId = new Map<string, { slug: string; brandName: string | null }>();
  for (const row of portalRows ?? []) {
    slugByOrgId.set(row.organization_id as string, {
      slug: row.slug as string,
      brandName: (row.brand_name as string | null) ?? null,
    });
  }

  const results: RecentCustomerPortal[] = [];
  for (const row of customerRows) {
    const organization = first(row.organizations);
    const portal = slugByOrgId.get(row.organization_id);
    if (!organization || !portal) continue;
    results.push({
      organizationId: row.organization_id,
      organizationName: organization.name,
      slug: portal.slug,
      brandName: portal.brandName,
    });
  }
  return results;
}

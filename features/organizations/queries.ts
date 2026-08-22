import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Just created_at -- the name is already available on scope.organization.name
 * (resolved by getTenantScope(), see lib/auth/organization.ts), so this
 * doesn't re-fetch it. organizationId must already be a server-resolved,
 * RLS-verified value (scope.organization.id) -- never a raw client-supplied
 * id trusted for authorization. RLS (organizations_select_related) is the
 * actual boundary: any caller with real organization access to this id can
 * read this, nothing more.
 */
export async function getOrganizationCreatedAt(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<string> {
  const { data, error } = await supabase
    .from("organizations")
    .select("created_at")
    .eq("id", organizationId)
    .single();

  if (error) {
    throw new Error(`Failed to load organization: ${error.message}`);
  }

  return data.created_at as string;
}

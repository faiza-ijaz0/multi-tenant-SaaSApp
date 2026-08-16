import type { SupabaseClient } from "@supabase/supabase-js";

import type { OrganizationRole } from "./types";

export interface OrganizationMember {
  membershipId: string;
  profileId: string;
  role: OrganizationRole;
  isCurrentUser: boolean;
}

/**
 * The full member roster for an organization. RLS (memberships_select_member)
 * already scopes this to organizations the caller actually belongs to --
 * any member (not just admins) can see the full roster of their own org,
 * per the existing policy design. This function doesn't change that
 * visibility model, only shapes the result for display.
 */
export async function getOrganizationMembers(
  supabase: SupabaseClient,
  organizationId: string,
  currentUserId: string,
): Promise<OrganizationMember[]> {
  const { data, error } = await supabase
    .from("memberships")
    .select("id, profile_id, role, created_at")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to load organization members: ${error.message}`);
  }

  return (data ?? []).map((row) => ({
    membershipId: row.id as string,
    profileId: row.profile_id as string,
    role: row.role as OrganizationRole,
    isCurrentUser: row.profile_id === currentUserId,
  }));
}

/** The organization's public-portal slug, if portal_settings exists for it yet. */
export async function getOrganizationPortalSlug(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("portal_settings")
    .select("slug")
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load portal settings: ${error.message}`);
  }

  return data?.slug ?? null;
}

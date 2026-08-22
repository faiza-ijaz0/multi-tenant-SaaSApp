import type { SupabaseClient } from "@supabase/supabase-js";

import type { OrganizationRole } from "./types";

export interface OrganizationMember {
  membershipId: string;
  profileId: string;
  role: OrganizationRole;
  isCurrentUser: boolean;
  joinedAt: string;
  updatedAt: string;
}

/**
 * Bounded at a generous cap, matching this codebase's existing list-cap
 * convention (features/submissions/queries.ts: 200, features/comments/queries.ts:
 * 500) -- a query with no limit at all on a table that can grow is a
 * correctness/performance risk regardless of today's actual data volume.
 */
const MEMBER_LIST_LIMIT = 500;

/**
 * Thrown instead of silently truncating the roster when an organization
 * has grown past MEMBER_LIST_LIMIT -- callers must show an honest,
 * degraded state (see app/dashboard/role-management/page.tsx and
 * app/dashboard/settings/page.tsx) rather than quietly rendering a partial
 * member list as if it were complete. Not expected to trigger in practice
 * at this product's current scale; exists so growth fails loudly, not
 * silently.
 */
export class MemberRosterTooLargeError extends Error {
  constructor(message = "This organization has more members than can be displayed right now.") {
    super(message);
    this.name = "MemberRosterTooLargeError";
  }
}

/**
 * The full member roster for an organization. RLS (memberships_select_member)
 * already scopes this to organizations the caller actually belongs to --
 * any member (not just admins) can see the full roster of their own org,
 * per the existing policy design. This function doesn't change that
 * visibility model, only shapes the result for display.
 *
 * No display name or email here, deliberately: profiles_select_own only
 * lets a caller read their *own* profiles row (no policy exists for
 * reading a teammate's), and profiles has no email column at all (email
 * lives in auth.users, never exposed to authenticated/anon clients). This
 * is the real ceiling of what's safely available for another member, not
 * an oversight -- callers needing a real display name/email use
 * features/members/queries.ts's enrichMembersWithContactInfo (the
 * get_organization_contact_profiles RPC) on top of this, as
 * app/dashboard/role-management/page.tsx and
 * app/dashboard/settings/organization/page.tsx both do; this function's
 * own "You" / truncated-id shape is only the pre-enrichment fallback.
 */
export async function getOrganizationMembers(
  supabase: SupabaseClient,
  organizationId: string,
  currentUserId: string,
): Promise<OrganizationMember[]> {
  const { data, error, count } = await supabase
    .from("memberships")
    .select("id, profile_id, role, created_at, updated_at", { count: "exact" })
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: true })
    .limit(MEMBER_LIST_LIMIT);

  if (error) {
    throw new Error(`Failed to load organization members: ${error.message}`);
  }
  if (count !== null && count > MEMBER_LIST_LIMIT) {
    throw new MemberRosterTooLargeError();
  }

  return (data ?? []).map((row) => ({
    membershipId: row.id as string,
    profileId: row.profile_id as string,
    role: row.role as OrganizationRole,
    isCurrentUser: row.profile_id === currentUserId,
    joinedAt: row.created_at as string,
    updatedAt: row.updated_at as string,
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

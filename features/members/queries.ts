import type { SupabaseClient } from "@supabase/supabase-js";

import type { OrganizationMember } from "@/lib/auth/organization-details";

export interface OrganizationMemberWithContact extends OrganizationMember {
  fullName: string | null;
  email: string | null;
}

/**
 * Enriches the roster from getOrganizationMembers (lib/auth/organization-details.ts)
 * with real name/email, resolved via get_organization_contact_profiles
 * (0011_organization_contact_profiles_rpc.sql, NOT YET APPLIED -- see the
 * Phase 14 report). That RPC only ever returns a row for a profile that
 * actually shares organizationId with the caller (as a member or customer),
 * and only for the ids explicitly passed in -- this cannot be used to look
 * up an arbitrary profile.
 *
 * Never throws on RPC failure (e.g. because 0011 hasn't been applied to the
 * database yet): falls back to the existing "You" / "Member ⟨id⟩" display,
 * exactly matching this codebase's pre-Phase-14 behavior, rather than
 * breaking the whole Members page over a missing enrichment.
 */
export async function enrichMembersWithContactInfo(
  supabase: SupabaseClient,
  organizationId: string,
  members: OrganizationMember[],
): Promise<OrganizationMemberWithContact[]> {
  if (members.length === 0) return [];

  const { data, error } = await supabase.rpc("get_organization_contact_profiles", {
    p_organization_id: organizationId,
    p_profile_ids: members.map((member) => member.profileId),
  });

  if (error) {
    console.error("enrichMembersWithContactInfo: get_organization_contact_profiles failed:", error);
    return members.map((member) => ({ ...member, fullName: null, email: null }));
  }

  const contactByProfileId = new Map<string, { fullName: string | null; email: string | null }>(
    (data ?? []).map((row: Record<string, unknown>) => [
      row.profile_id as string,
      { fullName: (row.full_name as string | null) ?? null, email: (row.email as string | null) ?? null },
    ]),
  );

  return members.map((member) => {
    const contact = contactByProfileId.get(member.profileId);
    return {
      ...member,
      fullName: contact?.fullName ?? null,
      email: contact?.email ?? null,
    };
  });
}

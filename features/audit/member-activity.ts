import type { SupabaseClient } from "@supabase/supabase-js";

export interface MemberActivityEntry {
  profileId: string;
  name: string;
  email: string | null;
  submissionCount: number;
  auditEventCount: number;
  totalCount: number;
}

/**
 * "Who is doing what" -- real per-member counts, not derived from a
 * nonexistent "all activity by member" table. audit_events only reliably
 * records privileged, admin-authored actions (role changes, removals,
 * password changes, submission status changes -- see this feature's own
 * queries.ts doc comment); submission *creation* has its own real
 * submitted_by column, counted here directly instead of relying on the
 * (sparser) audit log for that specific slice. Both counts are bounded to
 * [since, now) and to this organization -- never a client-supplied
 * organizationId, always scope.organization.id from the caller.
 *
 * Real names/emails resolved via get_organization_contact_profiles (the
 * same RPC features/members/queries.ts's enrichMembersWithContactInfo
 * already uses) -- never a raw profile_id/UUID shown. A profile_id the RPC
 * can't resolve (the person is no longer a member of this organization at
 * all) is labeled "Former member," not a truncated ID.
 */
export async function getMemberActivityRanking(
  supabase: SupabaseClient,
  organizationId: string,
  since: string,
  limit = 10,
): Promise<MemberActivityEntry[]> {
  const [submissionsResult, auditResult] = await Promise.all([
    supabase
      .from("submissions")
      .select("submitted_by")
      .eq("organization_id", organizationId)
      .gte("created_at", since)
      .not("submitted_by", "is", null),
    supabase
      .from("audit_events")
      .select("actor_profile_id")
      .eq("organization_id", organizationId)
      .gte("created_at", since)
      .not("actor_profile_id", "is", null),
  ]);

  if (submissionsResult.error) {
    throw new Error(`Failed to load submission activity: ${submissionsResult.error.message}`);
  }
  if (auditResult.error) {
    throw new Error(`Failed to load audit activity: ${auditResult.error.message}`);
  }

  const submissionCounts = new Map<string, number>();
  for (const row of submissionsResult.data ?? []) {
    const id = row.submitted_by as string;
    submissionCounts.set(id, (submissionCounts.get(id) ?? 0) + 1);
  }

  const auditCounts = new Map<string, number>();
  for (const row of auditResult.data ?? []) {
    const id = row.actor_profile_id as string;
    auditCounts.set(id, (auditCounts.get(id) ?? 0) + 1);
  }

  const profileIds = Array.from(new Set([...submissionCounts.keys(), ...auditCounts.keys()]));
  if (profileIds.length === 0) return [];

  const { data: contacts, error: contactsError } = await supabase.rpc("get_organization_contact_profiles", {
    p_organization_id: organizationId,
    p_profile_ids: profileIds,
  });
  if (contactsError) {
    console.error("getMemberActivityRanking: get_organization_contact_profiles failed:", contactsError);
  }
  const contactByProfileId = new Map<string, { fullName: string | null; email: string | null }>(
    (contacts ?? []).map((row: Record<string, unknown>) => [
      row.profile_id as string,
      { fullName: (row.full_name as string | null) ?? null, email: (row.email as string | null) ?? null },
    ]),
  );

  const entries: MemberActivityEntry[] = profileIds.map((profileId) => {
    const contact = contactByProfileId.get(profileId);
    const submissionCount = submissionCounts.get(profileId) ?? 0;
    const auditEventCount = auditCounts.get(profileId) ?? 0;
    return {
      profileId,
      name: contact?.fullName || contact?.email || "Former member",
      email: contact?.email ?? null,
      submissionCount,
      auditEventCount,
      totalCount: submissionCount + auditEventCount,
    };
  });

  entries.sort((a, b) => b.totalCount - a.totalCount);
  return entries.slice(0, limit);
}

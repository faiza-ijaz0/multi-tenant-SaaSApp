import type { SupabaseClient } from "@supabase/supabase-js";

import type { OrganizationRole } from "@/lib/auth/types";

export interface MembershipMutationResult {
  ok: boolean;
  message?: string;
}

const VALID_ROLES: readonly OrganizationRole[] = ["owner", "admin", "member"];

export function isValidRole(value: string): value is OrganizationRole {
  return (VALID_ROLES as readonly string[]).includes(value);
}

interface TargetMembership {
  role: OrganizationRole;
  profile_id: string;
}

async function loadTargetMembership(
  supabase: SupabaseClient,
  organizationId: string,
  membershipId: string,
): Promise<{ data: TargetMembership | null; error: string | null }> {
  const { data, error } = await supabase
    .from("memberships")
    .select("role, profile_id")
    .eq("id", membershipId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) return { data: null, error: "Something went wrong looking up that member." };
  if (!data) return { data: null, error: "Member not found." };
  return { data: data as TargetMembership, error: null };
}

/**
 * Framework-agnostic core, extracted the same way
 * features/submissions/status.ts extracts updateSubmissionStatusForOrganization
 * -- directly testable with a real Supabase session, since the "use server"
 * action wrapping this can't run outside a Next.js request (getTenantScope()
 * needs cookies()).
 *
 * memberships_update_admin (0003_rls_policies.sql) only checks that the
 * caller is an admin/owner of the organization -- by itself it would not
 * restrict which role they may set, protect a currently-owner row, or stop
 * profile_id from being rewritten by the same UPDATE. That gap is now
 * closed at the DB layer too: enforce_membership_role_invariants (BEFORE
 * UPDATE trigger, 0004_membership_ownership_hardening.sql, applied and
 * verified live) independently enforces the same owner-role and
 * profile_id-immutability rules, so a raw PostgREST request that bypasses
 * this function entirely is no longer unprotected. The checks below remain
 * as application-level defense in depth (a clean, specific error message
 * before ever reaching the DB), not the sole guard.
 */
export async function updateMemberRoleForOrganization(
  supabase: SupabaseClient,
  organizationId: string,
  actorUserId: string,
  actorRole: OrganizationRole,
  membershipId: string,
  newRole: OrganizationRole,
): Promise<MembershipMutationResult> {
  const target = await loadTargetMembership(supabase, organizationId, membershipId);
  if (target.error) return { ok: false, message: target.error };
  const current = target.data!;

  if (current.profile_id === actorUserId) {
    return { ok: false, message: "You can't change your own role." };
  }
  // The owner boundary is also enforced independently by the
  // enforce_membership_role_invariants trigger (0004, applied live) -- this
  // app-level check exists for a clean, specific error message before ever
  // reaching the DB, not as the sole protection against "any admin"
  // granting themselves ownership or demoting the real owner.
  if ((current.role === "owner" || newRole === "owner") && actorRole !== "owner") {
    return { ok: false, message: "Only an owner can change the owner role." };
  }
  if (current.role === newRole) {
    return { ok: true };
  }

  const { data, error } = await supabase
    .from("memberships")
    .update({ role: newRole })
    .eq("id", membershipId)
    .eq("organization_id", organizationId)
    .select("id");

  if (error) {
    console.error("updateMemberRoleForOrganization failed:", error);
    return { ok: false, message: "Something went wrong updating this member's role." };
  }
  if (!data || data.length === 0) {
    // RLS-denied or the row disappeared between the read above and this
    // write (e.g. removed by someone else in the interim) -- either way,
    // a 0-row UPDATE must never be reported as success.
    return { ok: false, message: "Member not found." };
  }

  return { ok: true };
}

/**
 * Same rationale as updateMemberRoleForOrganization above --
 * memberships_delete_admin_or_self lets any admin delete any membership in
 * their org, including an owner's; enforce_membership_owner_delete_protection
 * (0004, applied live) independently blocks a non-owner from removing an
 * owner, AND independently blocks removing the organization's last
 * remaining owner, regardless of who the actor is. This app-level guard
 * mirrors only the first of those two DB-level rules (for a clean, specific
 * error message before ever reaching the DB) -- the "last owner" case is
 * deliberately NOT re-implemented here: multiple owners are fully
 * supported (Phase 15), so an owner removing a co-owner is a normal,
 * allowed operation, and the DB trigger is the sole source of truth for
 * whether zero owners would remain. Duplicating that count here would risk
 * drifting out of sync with the trigger's own logic.
 */
export async function removeMemberForOrganization(
  supabase: SupabaseClient,
  organizationId: string,
  actorUserId: string,
  actorRole: OrganizationRole,
  membershipId: string,
): Promise<MembershipMutationResult> {
  const target = await loadTargetMembership(supabase, organizationId, membershipId);
  if (target.error) return { ok: false, message: target.error };
  const current = target.data!;

  if (current.profile_id === actorUserId) {
    return { ok: false, message: "You can't remove yourself from the organization." };
  }
  if (current.role === "owner" && actorRole !== "owner") {
    return { ok: false, message: "Only an owner can remove another owner." };
  }

  const { data, error } = await supabase
    .from("memberships")
    .delete()
    .eq("id", membershipId)
    .eq("organization_id", organizationId)
    .select("id");

  if (error) {
    // 23514: enforce_membership_owner_delete_protection's "at least one
    // owner must remain" check (0004, applied live) -- a real, expected,
    // user-facing outcome (Phase 15 explicitly requires multiple owners be
    // removable down to exactly one, never zero), not an unexpected
    // failure. Every other error code is genuinely unexpected.
    if (error.code === "23514") {
      return {
        ok: false,
        message: "This organization must have at least one owner. Make someone else an owner first.",
      };
    }
    console.error("removeMemberForOrganization failed:", error);
    return { ok: false, message: "Something went wrong removing this member." };
  }
  if (!data || data.length === 0) {
    return { ok: false, message: "Member not found." };
  }

  return { ok: true };
}

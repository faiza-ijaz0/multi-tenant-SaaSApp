"use server";

import { revalidatePath } from "next/cache";

import { getTenantScope } from "@/lib/auth/context";
import { requireAction } from "@/lib/authorization/permissions";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

import { logMemberAuditEvent } from "./actions";

const ROLE_MANAGEMENT_PATH = "/dashboard/role-management";
const MIN_PASSWORD_LENGTH = 8;

export interface ChangeMemberPasswordResult {
  ok: boolean;
  message?: string;
  fieldErrors?: { password?: string; confirmPassword?: string };
}

/**
 * Two distinct paths, chosen entirely by whether the DB-resolved target row
 * turns out to be the caller's own membership -- never by anything the
 * client claims:
 *
 *   - SELF: the caller changing their own password needs nothing beyond
 *     being authenticated (already guaranteed by getTenantScope() throwing
 *     otherwise) and the target genuinely resolving to their own profile_id.
 *     No roles_permissions:assign_role check -- member-management authority
 *     over *other* accounts has never been a prerequisite for managing your
 *     own. Uses scope.supabase.auth.updateUser(), the caller's own
 *     session-bound client -- the exact same call lib/auth/auth-actions.ts's
 *     updatePassword() already uses for the recovery-link flow -- so this
 *     can only ever touch the signed-in session's own account, never needs
 *     the service-role key, and (per Supabase's own updateUser behavior)
 *     does not invalidate the current session.
 *
 *   - OTHER: unchanged from before -- gated by roles_permissions:assign_role
 *     (the same permission that already governs the combined Edit Member
 *     action, features/members/update-account.ts), rejects a non-owner
 *     acting on an owner, and updates via the service-role Auth Admin API
 *     (create-account.ts/update-account.ts's established pattern) since
 *     there is no other way to set a different user's password.
 *
 * Either way, the target membership is always re-looked-up scoped to the
 * caller's own organization.id via the caller's own RLS-respecting client
 * (never a client-supplied organizationId/profileId, and never a service-
 * role read) -- the SELECT itself already only returns a row the caller is
 * allowed to see (their own row unconditionally, or a co-member's row when
 * they hold the 'members' page permission), so an arbitrary membershipId
 * from another organization or an inaccessible row simply resolves to
 * nothing, independent of any check below. The password itself is never
 * logged (logMemberAuditEvent records only the membershipId).
 */
export async function changeMemberPassword(
  membershipId: string,
  formData: FormData,
): Promise<ChangeMemberPasswordResult> {
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  const fieldErrors: ChangeMemberPasswordResult["fieldErrors"] = {};
  if (password.length < MIN_PASSWORD_LENGTH) {
    fieldErrors.password = `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (confirmPassword !== password) {
    fieldErrors.confirmPassword = "Passwords don't match.";
  }
  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors };
  }

  const scope = await getTenantScope();

  const { data: target, error: lookupError } = await scope.supabase
    .from("memberships")
    .select("role, profile_id")
    .eq("id", membershipId)
    .eq("organization_id", scope.organization.id)
    .maybeSingle();
  if (lookupError || !target) {
    return { ok: false, message: "Member not found." };
  }

  if (target.profile_id === scope.user.id) {
    const { error: selfUpdateError } = await scope.supabase.auth.updateUser({ password });
    if (selfUpdateError) {
      console.error("changeMemberPassword: self auth.updateUser failed:", selfUpdateError.message);
      return { ok: false, message: "Something went wrong changing your password." };
    }

    await logMemberAuditEvent(scope, "member.password_changed", membershipId);
    revalidatePath(ROLE_MANAGEMENT_PATH);
    return { ok: true };
  }

  try {
    await requireAction(scope, "roles_permissions:assign_role");
  } catch {
    return { ok: false, message: "You don't have permission to do that." };
  }
  if (target.role === "owner" && scope.membership.role !== "owner") {
    return { ok: false, message: "Only an owner can change another owner's password." };
  }

  const serviceRole = createServiceRoleClient();
  const { error: updateError } = await serviceRole.auth.admin.updateUserById(target.profile_id as string, {
    password,
  });
  if (updateError) {
    console.error("changeMemberPassword: auth.admin.updateUserById failed:", updateError.message);
    return { ok: false, message: "Something went wrong changing this member's password." };
  }

  await logMemberAuditEvent(scope, "member.password_changed", membershipId);

  revalidatePath(ROLE_MANAGEMENT_PATH);
  return { ok: true };
}

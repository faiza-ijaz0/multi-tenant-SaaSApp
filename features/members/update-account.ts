"use server";

import type { PostgrestError } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";

import { getTenantScope } from "@/lib/auth/context";
import { getEffectivePermissions, hasAction, requireAction } from "@/lib/authorization/permissions";
import { isActionPermissionKey, isPageKey } from "@/lib/authorization/registry";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import type { OrganizationRole } from "@/lib/auth/types";

import { logMemberAuditEvent } from "./actions";
import { isValidRole, updateMemberRoleForOrganization } from "./membership";
import { setMembershipPermissions } from "./permissions";

const ROLE_MANAGEMENT_PATH = "/dashboard/role-management";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_NAME_LENGTH = 120;

export interface UpdateMemberAccountResult {
  ok: boolean;
  message?: string;
  fieldErrors?: { name?: string; email?: string; role?: string };
}

function getCheckedKeys<T extends string>(formData: FormData, name: string, guard: (value: string) => value is T): T[] {
  return formData.getAll(name).map(String).filter(guard);
}

function mapUpdateProfileError(error: PostgrestError): string {
  switch (error.code) {
    case "P0002":
      return "Member not found.";
    case "42501":
      return error.message.includes("own account")
        ? "Edit your own account from your profile settings, not here."
        : error.message.includes("owner")
          ? "Only an owner can edit another owner's account."
          : "You don't have permission to edit this member.";
    default:
      console.error("updateMemberAccount: unexpected error from update_member_profile RPC:", error);
      return "Something went wrong updating this member.";
  }
}

/**
 * Combined Edit Member flow: name, email, role, pages, and actions in one
 * save, matching the Phase 15 spec's single "Edit" action per row (not
 * separate Edit-role and Edit-permissions dialogs). Each sub-update goes
 * through the exact same authorization-bearing path Phase 14 already
 * established for that specific field, reused as-is:
 *   - name -> update_member_profile() RPC (0014) -- its own independent
 *     authorization check is the real boundary, not this function's
 *     pre-check.
 *   - role -> updateMemberRoleForOrganization (unchanged) -- RLS +
 *     enforce_membership_role_invariants (0004) are the real boundary.
 *   - pages/actions -> setMembershipPermissions (unchanged) -- RLS's
 *     can_manage_membership_permissions (0013) is the real boundary, and
 *     requires roles_permissions:manage_permissions specifically, a
 *     narrower grant than roles_permissions:assign_role. Rather than
 *     failing the whole save when the actor lacks that narrower grant
 *     (confusing: role/name already saved, only this part failed), this
 *     silently skips the pages/actions write when the actor's own
 *     effective permissions don't include it -- exactly the same outcome
 *     as if the caller had never submitted that data, matching the Edit
 *     dialog's own UI (features/members/member-edit-dialog.tsx disables
 *     that tab, not just hides it, when the actor can't use it).
 *   - email -> Auth Admin API via the service-role client (server-only,
 *     see lib/supabase/service-role.ts) -- no SQL path can reach
 *     auth.users.email. Only attempted when the submitted value differs
 *     from the value the dialog was opened with (a hidden `currentEmail`
 *     field), so an unrelated save (e.g. just a role change) never makes
 *     an Auth Admin API call at all.
 */
export async function updateMemberAccount(membershipId: string, formData: FormData): Promise<UpdateMemberAccountResult> {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const currentEmail = String(formData.get("currentEmail") ?? "").trim().toLowerCase();
  const role = String(formData.get("role") ?? "");
  const pages = getCheckedKeys(formData, "pagePermissions", isPageKey);
  const actions = getCheckedKeys(formData, "actionPermissions", isActionPermissionKey);

  const fieldErrors: UpdateMemberAccountResult["fieldErrors"] = {};
  if (!name) fieldErrors.name = "Enter a name.";
  else if (name.length > MAX_NAME_LENGTH) fieldErrors.name = `Keep it under ${MAX_NAME_LENGTH} characters.`;
  if (!EMAIL_PATTERN.test(email)) fieldErrors.email = "Enter a valid email address.";
  if (!isValidRole(role)) fieldErrors.role = "Choose a role.";
  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors };
  }

  const scope = await getTenantScope();
  try {
    await requireAction(scope, "roles_permissions:assign_role");
  } catch {
    return { ok: false, message: "You don't have permission to edit this member." };
  }

  const profileResult = await scope.supabase.rpc("update_member_profile", {
    p_membership_id: membershipId,
    p_full_name: name,
  });
  if (profileResult.error) {
    return { ok: false, message: mapUpdateProfileError(profileResult.error) };
  }

  const roleResult = await updateMemberRoleForOrganization(
    scope.supabase,
    scope.organization.id,
    scope.user.id,
    scope.membership.role,
    membershipId,
    role as OrganizationRole,
  );
  if (!roleResult.ok) return roleResult;

  const permissions = await getEffectivePermissions(scope);
  if (hasAction(permissions, "roles_permissions:manage_permissions")) {
    const permissionsResult = await setMembershipPermissions(scope.supabase, membershipId, pages, actions);
    if (!permissionsResult.ok) return permissionsResult;
  }

  if (email && email !== currentEmail) {
    const { data: targetRow, error: lookupError } = await scope.supabase
      .from("memberships")
      .select("profile_id")
      .eq("id", membershipId)
      .eq("organization_id", scope.organization.id)
      .maybeSingle();
    if (lookupError || !targetRow) {
      return { ok: false, message: "Name, role, and permissions were saved, but the email could not be updated -- member not found." };
    }

    const serviceRole = createServiceRoleClient();
    const { error: emailError } = await serviceRole.auth.admin.updateUserById(targetRow.profile_id as string, { email });
    if (emailError) {
      const message = /already.*registered|already.*exists/i.test(emailError.message)
        ? "Name, role, and permissions were saved, but that email is already in use by another account."
        : "Name, role, and permissions were saved, but the email could not be updated.";
      return { ok: false, message };
    }
  }

  await logMemberAuditEvent(scope, "member.updated", membershipId, { name, role });

  revalidatePath(ROLE_MANAGEMENT_PATH);
  return { ok: true };
}

"use server";

import type { PostgrestError } from "@supabase/supabase-js";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getTenantScope } from "@/lib/auth/context";
import { selectOrganization } from "@/lib/auth/actions";
import { getAuthenticatedUser } from "@/lib/auth/user";
import { createClient } from "@/lib/supabase/server";
import { ACTION_OK, type ActionResult } from "@/lib/action-result";
import { requireAction } from "@/lib/authorization/permissions";
import { isActionPermissionKey, isPageKey, type ActionPermissionKeyAll } from "@/lib/authorization/registry";
import type { OrganizationRole } from "@/lib/auth/types";

import {
  MAX_INVITATION_EMAIL_LENGTH,
  type InvitationFormState,
} from "./invitation-form-state";
import { createInvitationForOrganization, revokeInvitationForOrganization } from "./invitations";
import { isValidRole, removeMemberForOrganization, updateMemberRoleForOrganization } from "./membership";
import { setMembershipPermissions } from "./permissions";

const MEMBERS_PATH = "/dashboard/role-management";
const SETTINGS_PATH = "/dashboard/settings/organization";
// Reused by removeMember below -- features/organizations/remove-member-button.tsx
// calls this same removeMember() action from the dedicated Organization
// Members page, so that page's roster also needs revalidating on removal.
const ORGANIZATION_MEMBERS_PATH = "/dashboard/settings/organization/members";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Extracts every `formData` value for a repeated checkbox input name, filtered to valid keys. */
function getCheckedPageKeys(formData: FormData, name: string): string[] {
  return formData.getAll(name).map(String).filter(isPageKey);
}
function getCheckedActionKeys(formData: FormData, name: string): string[] {
  return formData.getAll(name).map(String).filter(isActionPermissionKey);
}

/** Mirrors lib/auth/auth-actions.ts's own getOrigin() -- kept local rather
 * than exported/shared, matching this codebase's existing tolerance for a
 * small duplicated helper per feature (e.g. HEX_COLOR_PATTERN is
 * duplicated between features/categories and features/statuses already). */
async function getOrigin(): Promise<string> {
  const headersList = await headers();
  const host = headersList.get("x-forwarded-host") ?? headersList.get("host") ?? "localhost:3000";
  const protocol = headersList.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${protocol}://${host}`;
}

/**
 * App-level pre-check for a clean error message -- memberships_update_admin/
 * memberships_delete_admin_or_self/invitations_* (all extended by
 * 0013_membership_action_permissions.sql with an AND has_action_permission
 * clause) remain the actual RLS-level gate regardless of this check (with
 * the caveat documented in features/members/membership.ts about what RLS
 * alone does not cover).
 */
async function requireMembersAction(key: ActionPermissionKeyAll) {
  const scope = await getTenantScope();
  try {
    await requireAction(scope, key);
  } catch {
    throw new Error("You don't have permission to do that.");
  }
  return scope;
}

/**
 * Best-effort audit log write -- member/role/permission/invitation changes
 * are always admin/owner-authored, so this uses the existing direct-insert
 * path under audit_events_insert_admin (same pattern already proven by
 * features/submissions/status.ts for submission.status_changed), not the
 * 0012 RPC (which is scoped to non-admin submission.created/comment.created
 * only). A failure here never fails the underlying mutation -- the roster
 * change has already succeeded and must not be rolled back just because the
 * log entry didn't write.
 */
export async function logMemberAuditEvent(
  scope: Awaited<ReturnType<typeof getTenantScope>>,
  action: string,
  entityId: string | null,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  const { error } = await scope.supabase.from("audit_events").insert({
    organization_id: scope.organization.id,
    actor_profile_id: scope.user.id,
    action,
    entity_type: "membership",
    entity_id: entityId,
    metadata,
  });
  if (error) {
    console.error(`logMemberAuditEvent(${action}) failed:`, error);
  }
}

export async function updateMemberRole(membershipId: string, newRole: string): Promise<ActionResult> {
  if (!isValidRole(newRole)) {
    return { ok: false, message: "Invalid role." };
  }

  let scope;
  try {
    scope = await requireMembersAction("roles_permissions:assign_role");
  } catch {
    return { ok: false, message: "You don't have permission to do that." };
  }

  const result = await updateMemberRoleForOrganization(
    scope.supabase,
    scope.organization.id,
    scope.user.id,
    scope.membership.role,
    membershipId,
    newRole as OrganizationRole,
  );
  if (!result.ok) return result;

  await logMemberAuditEvent(scope, "member.role_changed", membershipId, { newRole });

  revalidatePath(MEMBERS_PATH);
  revalidatePath(SETTINGS_PATH);
  return ACTION_OK;
}

/**
 * Saves the exact chosen set of page/action permission grants for one
 * membership. Gated by roles_permissions:manage_permissions -- separate
 * from members:delete/invite, matching the spec's split between "manage
 * members" and "manage roles & permissions." can_manage_membership_permissions
 * (0013) is the real authorization boundary underneath setMembershipPermissions'
 * writes (also rejects targeting the owner or your own row); this is an
 * app-level pre-check for a clean error message.
 */
export async function updateMemberPermissions(
  membershipId: string,
  pages: string[],
  actions: string[],
): Promise<ActionResult> {
  let scope;
  try {
    scope = await requireMembersAction("roles_permissions:manage_permissions");
  } catch {
    return { ok: false, message: "You don't have permission to do that." };
  }

  const result = await setMembershipPermissions(scope.supabase, membershipId, pages, actions);
  if (!result.ok) return result;

  await logMemberAuditEvent(scope, "member.permissions_changed", membershipId, {
    pages,
    actions,
  });

  revalidatePath(MEMBERS_PATH);
  return ACTION_OK;
}

export async function createInvitation(
  _prevState: InvitationFormState,
  formData: FormData,
): Promise<InvitationFormState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = String(formData.get("role") ?? "");

  const fieldErrors: InvitationFormState["fieldErrors"] = {};
  if (!EMAIL_PATTERN.test(email)) {
    fieldErrors.email = "Enter a valid email address.";
  } else if (email.length > MAX_INVITATION_EMAIL_LENGTH) {
    fieldErrors.email = `Keep it under ${MAX_INVITATION_EMAIL_LENGTH} characters.`;
  }
  // Owner is deliberately not an offered option -- see
  // features/members/invitations.ts's InvitableRole for why.
  if (role !== "admin" && role !== "member") {
    fieldErrors.role = "Choose a role.";
  }
  if (Object.keys(fieldErrors).length > 0) {
    return { status: "error", fieldErrors };
  }

  let scope;
  try {
    scope = await requireMembersAction("invitations:create");
  } catch {
    return { status: "error", message: "You don't have permission to do that." };
  }

  const pagePermissions = getCheckedPageKeys(formData, "pagePermissions");
  const actionPermissions = getCheckedActionKeys(formData, "actionPermissions");

  const result = await createInvitationForOrganization(
    scope.supabase,
    scope.organization.id,
    scope.user.id,
    email,
    role as "admin" | "member",
    pagePermissions,
    actionPermissions,
  );
  if (!result.ok || !result.inviteToken) {
    return { status: "error", message: result.message ?? "Something went wrong." };
  }

  await logMemberAuditEvent(scope, "invitation.created", null, { email, role });

  const origin = await getOrigin();
  // The raw token lives only in this one response -- never persisted
  // (only its hash is), never logged. The admin must copy it now.
  const inviteUrl = `${origin}/invite/${result.inviteToken}`;

  revalidatePath(MEMBERS_PATH);
  return { status: "success", inviteUrl };
}

export async function revokeInvitation(invitationId: string): Promise<ActionResult> {
  let scope;
  try {
    scope = await requireMembersAction("invitations:revoke");
  } catch {
    return { ok: false, message: "You don't have permission to do that." };
  }

  const result = await revokeInvitationForOrganization(scope.supabase, scope.organization.id, invitationId);
  if (!result.ok) return result;

  await logMemberAuditEvent(scope, "invitation.revoked", null, { invitationId });

  revalidatePath(MEMBERS_PATH);
  return ACTION_OK;
}

/**
 * Maps accept_invitation()'s RAISE EXCEPTION codes (0005_invitation_acceptance.sql)
 * to safe, specific copy. The 22023 branch passes error.message straight
 * through deliberately: those messages are our own human-authored text
 * ('invitation expired', 'invitation already accepted', ...), not a raw
 * database/SQL error -- unlike the default branch below, which could be an
 * actual unexpected database error and must never reach the browser as-is.
 */
function mapAcceptInvitationError(error: PostgrestError): string {
  switch (error.code) {
    case "28000":
      return "Sign in to accept this invitation.";
    case "P0002":
      return "This invitation link is invalid.";
    case "42501":
      return "This invitation isn't valid for your account.";
    case "22023":
      return error.message;
    case "23505":
      // accept_invitation's own "already a member?" check is unlocked (see
      // 0005_invitation_acceptance.sql) -- memberships_org_profile_unique
      // is the real backstop against a race where the same person is added
      // to the same org through two paths at once (e.g. an admin adds them
      // directly at the same moment they accept). No duplicate row is ever
      // created either way; this only maps the resulting constraint error
      // to a safe, accurate message instead of the raw Postgres text.
      return "You are already a member of this organization.";
    default:
      console.error("acceptInvitation: unexpected error from accept_invitation RPC:", error);
      return "Something went wrong accepting this invitation.";
  }
}

/**
 * Calls the accept_invitation() RPC (0005_invitation_acceptance.sql) --
 * every identity involved (caller, email, target organization, resulting
 * role) is derived server-side by that function from auth.uid()/
 * auth.email() and the matched invitation row, never from a parameter this
 * action passes in beyond the opaque token itself. On success, reuses the
 * existing, validated selectOrganization() flow (lib/auth/actions.ts)
 * rather than writing the selected-organization cookie directly -- it
 * re-resolves against the membership accept_invitation just created, so it
 * can never select an organization this user isn't actually a member of.
 */
export async function acceptInvitation(token: string): Promise<ActionResult> {
  const supabase = await createClient();

  try {
    await getAuthenticatedUser(supabase);
  } catch {
    return { ok: false, message: "Sign in to accept this invitation." };
  }

  const { data, error } = await supabase.rpc("accept_invitation", { p_token: token });
  if (error) {
    return { ok: false, message: mapAcceptInvitationError(error) };
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.organization_id) {
    console.error("acceptInvitation: accept_invitation RPC returned no organization_id");
    return { ok: false, message: "Something went wrong accepting this invitation." };
  }

  await selectOrganization(row.organization_id);
  redirect("/dashboard");
}

/**
 * Maps transfer_organization_ownership()'s RAISE EXCEPTION codes
 * (0004_membership_ownership_hardening.sql, applied and verified live) to
 * safe, specific copy -- same pattern as mapAcceptInvitationError above.
 */
function mapTransferOwnershipError(error: PostgrestError): string {
  switch (error.code) {
    case "28000":
      return "Sign in to transfer ownership.";
    case "P0002":
      return "That member could not be found.";
    case "42501":
      return "Only the current owner can transfer ownership.";
    case "22023":
      return error.message;
    default:
      console.error("transferOwnership: unexpected error from transfer_organization_ownership RPC:", error);
      return "Something went wrong transferring ownership.";
  }
}

/**
 * Calls transfer_organization_ownership() (0004_membership_ownership_hardening.sql)
 * -- the only sanctioned way to change who owns an organization. The RPC
 * itself derives the caller from auth.uid() and re-verifies (against
 * freshly locked rows) that the caller is actually the current owner of
 * the target membership's own organization; this action only adds the
 * app-level owner-only pre-check (for a clean error message, same pattern
 * as requireAdminScope above) and revalidation. Never accepts an
 * organization_id or role parameter -- both are derived entirely by the
 * RPC from the target membership row and the caller's session.
 */
export async function transferOwnership(membershipId: string): Promise<ActionResult> {
  const scope = await getTenantScope();
  if (scope.membership.role !== "owner") {
    return { ok: false, message: "Only the current owner can transfer ownership." };
  }

  const { error } = await scope.supabase.rpc("transfer_organization_ownership", {
    p_new_owner_membership_id: membershipId,
  });
  if (error) {
    return { ok: false, message: mapTransferOwnershipError(error) };
  }

  await logMemberAuditEvent(scope, "ownership.transferred", membershipId);

  revalidatePath(MEMBERS_PATH);
  revalidatePath(SETTINGS_PATH);
  return ACTION_OK;
}

export async function removeMember(membershipId: string): Promise<ActionResult> {
  let scope;
  try {
    scope = await requireMembersAction("members:delete");
  } catch {
    return { ok: false, message: "You don't have permission to do that." };
  }

  const result = await removeMemberForOrganization(
    scope.supabase,
    scope.organization.id,
    scope.user.id,
    scope.membership.role,
    membershipId,
  );
  if (!result.ok) return result;

  await logMemberAuditEvent(scope, "member.removed", membershipId);

  revalidatePath(MEMBERS_PATH);
  revalidatePath(SETTINGS_PATH);
  revalidatePath(ORGANIZATION_MEMBERS_PATH);
  return ACTION_OK;
}

"use server";

import type { PostgrestError } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";

import { getTenantScope } from "@/lib/auth/context";
import { requireAction } from "@/lib/authorization/permissions";
import { isActionPermissionKey, isPageKey } from "@/lib/authorization/registry";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

import { logMemberAuditEvent } from "./actions";
import type { CreateMemberAccountResult } from "./create-account-form-state";

const ROLE_MANAGEMENT_PATH = "/dashboard/role-management";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;
const MAX_NAME_LENGTH = 120;

function getCheckedKeys<T extends string>(formData: FormData, name: string, guard: (value: string) => value is T): T[] {
  return formData.getAll(name).map(String).filter(guard);
}

/**
 * Maps create_member_account()'s (0014_member_account_creation.sql)
 * RAISE EXCEPTION codes to safe, specific copy -- same pattern as
 * mapAcceptInvitationError/mapTransferOwnershipError in ./actions.ts.
 */
function mapCreateMemberAccountError(error: PostgrestError): string {
  switch (error.code) {
    case "28000":
      return "Sign in to create a member.";
    case "22023":
      return error.message;
    case "42501":
      return error.message.includes("owner")
        ? "Only an owner can create another owner."
        : "You don't have permission to create members in this organization.";
    default:
      console.error("createMemberAccount: unexpected error from create_member_account RPC:", error);
      return "Something went wrong creating the account.";
  }
}

/**
 * Direct account creation -- replaces the "invite by link" flow for this
 * form. Creates a real auth.users row with the admin-chosen password via
 * the Auth Admin API (service role, server-only -- see
 * lib/supabase/service-role.ts), then turns it into a real organization
 * member via create_member_account() (0014), which does its own complete,
 * independent authorization check (never trusts this pre-check alone,
 * matching every other action in this codebase). The password is read
 * once from FormData, sent once to Supabase Auth over HTTPS, and never
 * touches any table this app controls, never logged, never echoed back.
 *
 * If the RPC rejects the membership (e.g. a permission was revoked in the
 * moment between the pre-check below and this call, or the role was
 * 'owner' and the caller wasn't), the just-created auth user is rolled
 * back -- otherwise a rejected request would still leave a real,
 * password-protected account with no organization access at all, which is
 * both confusing and a dangling identity nobody asked for.
 */
export async function createMemberAccount(
  _prevState: CreateMemberAccountResult,
  formData: FormData,
): Promise<CreateMemberAccountResult> {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const role = String(formData.get("role") ?? "");
  const pages = getCheckedKeys(formData, "pagePermissions", isPageKey);
  const actions = getCheckedKeys(formData, "actionPermissions", isActionPermissionKey);

  const fieldErrors: CreateMemberAccountResult["fieldErrors"] = {};
  if (!name) {
    fieldErrors.name = "Enter a name.";
  } else if (name.length > MAX_NAME_LENGTH) {
    fieldErrors.name = `Keep it under ${MAX_NAME_LENGTH} characters.`;
  }
  if (!EMAIL_PATTERN.test(email)) {
    fieldErrors.email = "Enter a valid email address.";
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    fieldErrors.password = `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (role !== "owner" && role !== "admin" && role !== "member") {
    fieldErrors.role = "Choose a role.";
  }
  if (Object.keys(fieldErrors).length > 0) {
    return { status: "error", fieldErrors };
  }

  const scope = await getTenantScope();
  try {
    await requireAction(scope, "members:invite");
  } catch {
    return { status: "error", message: "You don't have permission to create members." };
  }
  // App-level pre-check for a clean, specific error before ever calling the
  // Auth Admin API -- create_member_account() re-verifies this exact rule
  // independently (and is the actual authorization boundary), matching
  // this codebase's established "pre-check + real server-side check" shape.
  if (role === "owner" && scope.membership.role !== "owner") {
    return { status: "error", message: "Only an owner can create another owner." };
  }

  const serviceRole = createServiceRoleClient();
  const { data: created, error: createError } = await serviceRole.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createError || !created?.user) {
    const message = createError?.message ?? "";
    if (createError?.code === "email_exists" || /already.*registered|already.*exists/i.test(message)) {
      return { status: "error", fieldErrors: { email: "An account with this email already exists." } };
    }
    console.error("createMemberAccount: auth.admin.createUser failed:", createError?.message);
    return { status: "error", message: "Something went wrong creating the account." };
  }
  const newUserId = created.user.id;

  const { error: rpcError } = await scope.supabase.rpc("create_member_account", {
    p_organization_id: scope.organization.id,
    p_profile_id: newUserId,
    p_full_name: name,
    p_role: role,
    p_pages: pages,
    p_actions: actions,
  });

  if (rpcError) {
    const { error: cleanupError } = await serviceRole.auth.admin.deleteUser(newUserId);
    if (cleanupError) {
      console.error("createMemberAccount: failed to roll back orphaned auth user:", cleanupError.message);
    }
    return { status: "error", message: mapCreateMemberAccountError(rpcError) };
  }

  await logMemberAuditEvent(scope, "member.created", null, { email, role });

  revalidatePath(ROLE_MANAGEMENT_PATH);
  return { status: "success", message: "Account created successfully." };
}

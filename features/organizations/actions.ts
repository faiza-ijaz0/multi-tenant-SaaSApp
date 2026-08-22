"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import type { ActionResult } from "@/lib/action-result";
import { getTenantScope } from "@/lib/auth/context";
import { clearSelectedOrganization } from "@/lib/auth/selected-organization";
import { requireAction } from "@/lib/authorization/permissions";

import { MAX_ORGANIZATION_NAME_LENGTH, type UpdateOrganizationNameResult } from "./form-state";

const ORGANIZATION_SETTINGS_PATH = "/dashboard/settings/organization";

/**
 * Renames the current organization. Gated by organization_settings:edit --
 * an existing registry key (lib/authorization/registry.ts) that was already
 * wired into organizations_update_admin's RLS check (0013_membership_action_permissions.sql)
 * but had no server action using it until now. This app-level pre-check is
 * for a clean error message; the RLS policy (has_page_permission(id,
 * 'settings') AND has_action_permission(id, 'organization_settings:edit'))
 * remains the actual authorization boundary. Always writes to
 * scope.organization.id (server-resolved from the authenticated session),
 * never a client-supplied organization id.
 */
export async function updateOrganizationName(
  _prevState: UpdateOrganizationNameResult,
  formData: FormData,
): Promise<UpdateOrganizationNameResult> {
  const name = String(formData.get("name") ?? "").trim();

  if (!name) {
    return { status: "error", fieldErrors: { name: "Enter an organization name." } };
  }
  if (name.length > MAX_ORGANIZATION_NAME_LENGTH) {
    return {
      status: "error",
      fieldErrors: { name: `Keep it under ${MAX_ORGANIZATION_NAME_LENGTH} characters.` },
    };
  }

  const scope = await getTenantScope();
  try {
    await requireAction(scope, "organization_settings:edit");
  } catch {
    return { status: "error", message: "You don't have permission to do that." };
  }

  const { error } = await scope.supabase
    .from("organizations")
    .update({ name })
    .eq("id", scope.organization.id);
  if (error) {
    console.error("updateOrganizationName failed:", error);
    return { status: "error", message: "Something went wrong saving the organization name." };
  }

  revalidatePath(ORGANIZATION_SETTINGS_PATH);
  return { status: "success", message: "Organization name updated." };
}

/**
 * Permanently deletes the current organization -- cascades every row that
 * references it (memberships, categories, statuses, submissions, comments,
 * votes, portal_settings, audit_events; see 0001_initial_schema.sql's FKs
 * and 0007_organization_self_delete_fix.sql for why a sole owner deleting
 * their own organization specifically works). Deletion is never delegable
 * via an action permission (deliberately absent from
 * lib/authorization/registry.ts -- see its own comment on why) -- this
 * hardcoded owner-only check is the app-level pre-check for a clean
 * message; organizations_delete_owner (is_organization_owner(id)) is the
 * real authorization boundary underneath. Takes no organizationId
 * parameter at all: it only ever operates on scope.organization.id, the
 * server-resolved current tenant, so there is nothing here a client could
 * even attempt to override.
 */
export async function deleteOrganization(): Promise<ActionResult> {
  const scope = await getTenantScope();
  if (scope.membership.role !== "owner") {
    return { ok: false, message: "Only an owner can delete this organization." };
  }

  const { error } = await scope.supabase.from("organizations").delete().eq("id", scope.organization.id);
  if (error) {
    console.error("deleteOrganization failed:", error);
    return { ok: false, message: "Something went wrong deleting this organization." };
  }

  await clearSelectedOrganization();
  redirect("/dashboard");
}

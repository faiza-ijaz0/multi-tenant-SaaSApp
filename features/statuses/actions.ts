"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";

import { getTenantScope } from "@/lib/auth/context";
import { ACTION_OK, type ActionResult } from "@/lib/action-result";
import { requireAction } from "@/lib/authorization/permissions";

import { DEFAULT_STATUS_COLOR, MAX_STATUS_NAME_LENGTH, type StatusFormState } from "./form-state";
import { listStatuses } from "./queries";

const STATUSES_PATH = "/dashboard/statuses";
const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

/**
 * App-level pre-check for a clean error message -- statuses_insert_admin /
 * statuses_update_admin / statuses_delete_admin (extended by
 * 0013_membership_action_permissions.sql) remain the actual authorization
 * boundary regardless of this check.
 */
async function requireStatusAction(key: "statuses:create" | "statuses:edit" | "statuses:delete") {
  const scope = await getTenantScope();
  try {
    await requireAction(scope, key);
  } catch {
    throw new Error("You don't have permission to manage statuses.");
  }
  return scope;
}

export async function createStatus(
  _prevState: StatusFormState,
  formData: FormData,
): Promise<StatusFormState> {
  const name = String(formData.get("name") ?? "").trim();
  const color = String(formData.get("color") ?? DEFAULT_STATUS_COLOR).trim();
  const isClosed = formData.get("isClosed") === "on";

  if (!name) {
    return { status: "error", fieldErrors: { name: "Enter a status name." } };
  }
  if (name.length > MAX_STATUS_NAME_LENGTH) {
    return {
      status: "error",
      fieldErrors: { name: `Keep it under ${MAX_STATUS_NAME_LENGTH} characters.` },
    };
  }
  if (!HEX_COLOR_PATTERN.test(color)) {
    return { status: "error", fieldErrors: { color: "Pick a valid color." } };
  }

  let scope;
  try {
    scope = await requireStatusAction("statuses:create");
  } catch {
    return { status: "error", message: "You don't have permission to do that." };
  }

  const { supabase, organization } = scope;
  const { error } = await supabase.from("statuses").insert({
    id: randomUUID(),
    organization_id: organization.id,
    name,
    color,
    is_closed: isClosed,
  });

  if (error) {
    console.error("createStatus failed:", error);
    if (error.code === "23505") {
      return { status: "error", fieldErrors: { name: "A status with this name already exists." } };
    }
    return { status: "error", message: "Something went wrong creating the status." };
  }

  revalidatePath(STATUSES_PATH);
  return { status: "idle" };
}

export async function updateStatus(
  statusId: string,
  _prevState: StatusFormState,
  formData: FormData,
): Promise<StatusFormState> {
  const name = String(formData.get("name") ?? "").trim();
  const color = String(formData.get("color") ?? DEFAULT_STATUS_COLOR).trim();
  const isClosed = formData.get("isClosed") === "on";

  if (!name) {
    return { status: "error", fieldErrors: { name: "Enter a status name." } };
  }
  if (name.length > MAX_STATUS_NAME_LENGTH) {
    return {
      status: "error",
      fieldErrors: { name: `Keep it under ${MAX_STATUS_NAME_LENGTH} characters.` },
    };
  }
  if (!HEX_COLOR_PATTERN.test(color)) {
    return { status: "error", fieldErrors: { color: "Pick a valid color." } };
  }

  let scope;
  try {
    scope = await requireStatusAction("statuses:edit");
  } catch {
    return { status: "error", message: "You don't have permission to do that." };
  }

  const { data, error } = await scope.supabase
    .from("statuses")
    .update({ name, color, is_closed: isClosed })
    .eq("id", statusId)
    .eq("organization_id", scope.organization.id)
    .select("id");

  if (error) {
    console.error("updateStatus failed:", error);
    if (error.code === "23505") {
      return { status: "error", fieldErrors: { name: "A status with this name already exists." } };
    }
    return { status: "error", message: "Something went wrong updating the status." };
  }
  if (!data || data.length === 0) {
    return { status: "error", message: "This status no longer exists. Refresh and try again." };
  }

  revalidatePath(STATUSES_PATH);
  return { status: "idle" };
}

export async function deleteStatus(statusId: string): Promise<ActionResult> {
  let scope;
  try {
    scope = await requireStatusAction("statuses:delete");
  } catch {
    return { ok: false, message: "You don't have permission to do that." };
  }

  const { error } = await scope.supabase
    .from("statuses")
    .delete()
    .eq("id", statusId)
    .eq("organization_id", scope.organization.id);

  if (error) {
    console.error("deleteStatus failed:", error);
    // submissions_status_org_fk is ON DELETE RESTRICT -- every submission
    // must always have a valid workflow status, by design (0001_initial_schema.sql).
    if (error.code === "23503") {
      return {
        ok: false,
        message: "This status is still used by submissions. Move them to another status first.",
      };
    }
    return { ok: false, message: "Something went wrong deleting the status." };
  }

  revalidatePath(STATUSES_PATH);
  return ACTION_OK;
}

export async function moveStatus(statusId: string, direction: "up" | "down"): Promise<ActionResult> {
  let scope;
  try {
    scope = await requireStatusAction("statuses:edit");
  } catch {
    return { ok: false, message: "You don't have permission to do that." };
  }
  const { supabase, organization } = scope;

  const statuses = await listStatuses(supabase, organization.id);
  const index = statuses.findIndex((status) => status.id === statusId);
  if (index === -1) return ACTION_OK;

  const swapIndex = direction === "up" ? index - 1 : index + 1;
  if (swapIndex < 0 || swapIndex >= statuses.length) return ACTION_OK;

  const current = statuses[index];
  const neighbor = statuses[swapIndex];

  // sort_order in the WHERE clause is an optimistic-concurrency guard --
  // see the identical comment in features/categories/actions.ts's
  // moveCategory, which this mirrors exactly.
  const [a, b] = await Promise.all([
    supabase
      .from("statuses")
      .update({ sort_order: neighbor.sortOrder })
      .eq("id", current.id)
      .eq("organization_id", organization.id)
      .eq("sort_order", current.sortOrder)
      .select("id"),
    supabase
      .from("statuses")
      .update({ sort_order: current.sortOrder })
      .eq("id", neighbor.id)
      .eq("organization_id", organization.id)
      .eq("sort_order", neighbor.sortOrder)
      .select("id"),
  ]);

  if (a.error || b.error) {
    console.error("moveStatus failed:", a.error ?? b.error);
    return { ok: false, message: "Something went wrong reordering statuses." };
  }
  if (!a.data?.length || !b.data?.length) {
    return {
      ok: false,
      message: "This list changed while you were reordering it. Please try again.",
    };
  }

  revalidatePath(STATUSES_PATH);
  return ACTION_OK;
}

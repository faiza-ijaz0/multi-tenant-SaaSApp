"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";

import { getTenantScope } from "@/lib/auth/context";
import { ACTION_OK, type ActionResult } from "@/lib/action-result";
import { requireAction } from "@/lib/authorization/permissions";

import {
  MAX_CATEGORY_DESCRIPTION_LENGTH,
  MAX_CATEGORY_NAME_LENGTH,
  type CategoryFormState,
} from "./form-state";
import { listCategories } from "./queries";

const CATEGORIES_PATH = "/dashboard/categories";

/**
 * App-level pre-check for a clean error message -- categories_insert_admin /
 * categories_update_admin / categories_delete_admin (extended by
 * 0013_membership_action_permissions.sql with an AND has_action_permission
 * clause) remain the actual authorization boundary regardless of this check.
 */
async function requireCategoryAction(key: "categories:create" | "categories:edit" | "categories:delete") {
  const scope = await getTenantScope();
  try {
    await requireAction(scope, key);
  } catch {
    throw new Error("You don't have permission to manage categories.");
  }
  return scope;
}

export async function createCategory(
  _prevState: CategoryFormState,
  formData: FormData,
): Promise<CategoryFormState> {
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();

  if (!name) {
    return { status: "error", fieldErrors: { name: "Enter a category name." } };
  }
  if (name.length > MAX_CATEGORY_NAME_LENGTH) {
    return {
      status: "error",
      fieldErrors: { name: `Keep it under ${MAX_CATEGORY_NAME_LENGTH} characters.` },
    };
  }
  if (description.length > MAX_CATEGORY_DESCRIPTION_LENGTH) {
    return {
      status: "error",
      fieldErrors: { description: `Keep it under ${MAX_CATEGORY_DESCRIPTION_LENGTH} characters.` },
    };
  }

  let scope;
  try {
    scope = await requireCategoryAction("categories:create");
  } catch {
    return { status: "error", message: "You don't have permission to do that." };
  }

  const { supabase, organization } = scope;
  const { error } = await supabase.from("categories").insert({
    id: randomUUID(),
    organization_id: organization.id,
    name,
    description: description || null,
  });

  if (error) {
    console.error("createCategory failed:", error);
    if (error.code === "23505") {
      return { status: "error", fieldErrors: { name: "A category with this name already exists." } };
    }
    return { status: "error", message: "Something went wrong creating the category." };
  }

  revalidatePath(CATEGORIES_PATH);
  return { status: "idle" };
}

export async function updateCategory(
  categoryId: string,
  _prevState: CategoryFormState,
  formData: FormData,
): Promise<CategoryFormState> {
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const isActive = formData.get("isActive") === "on";

  if (!name) {
    return { status: "error", fieldErrors: { name: "Enter a category name." } };
  }
  if (name.length > MAX_CATEGORY_NAME_LENGTH) {
    return {
      status: "error",
      fieldErrors: { name: `Keep it under ${MAX_CATEGORY_NAME_LENGTH} characters.` },
    };
  }

  let scope;
  try {
    scope = await requireCategoryAction("categories:edit");
  } catch {
    return { status: "error", message: "You don't have permission to do that." };
  }

  const { data, error } = await scope.supabase
    .from("categories")
    .update({ name, description: description || null, is_active: isActive })
    .eq("id", categoryId)
    .eq("organization_id", scope.organization.id)
    .select("id");

  if (error) {
    console.error("updateCategory failed:", error);
    if (error.code === "23505") {
      return { status: "error", fieldErrors: { name: "A category with this name already exists." } };
    }
    return { status: "error", message: "Something went wrong updating the category." };
  }
  if (!data || data.length === 0) {
    // Someone else already deleted this category (e.g. a concurrent edit
    // in another tab) -- without this check, a zero-row UPDATE reports the
    // same success as a real one, and the dialog would close as if the
    // edit had actually applied.
    return { status: "error", message: "This category no longer exists. Refresh and try again." };
  }

  revalidatePath(CATEGORIES_PATH);
  return { status: "idle" };
}

export async function deleteCategory(categoryId: string): Promise<ActionResult> {
  let scope;
  try {
    scope = await requireCategoryAction("categories:delete");
  } catch {
    return { ok: false, message: "You don't have permission to do that." };
  }

  const { error } = await scope.supabase
    .from("categories")
    .delete()
    .eq("id", categoryId)
    .eq("organization_id", scope.organization.id);

  if (error) {
    console.error("deleteCategory failed:", error);
    return { ok: false, message: "Something went wrong deleting the category." };
  }

  revalidatePath(CATEGORIES_PATH);
  return ACTION_OK;
}

export async function moveCategory(
  categoryId: string,
  direction: "up" | "down",
): Promise<ActionResult> {
  let scope;
  try {
    scope = await requireCategoryAction("categories:edit");
  } catch {
    return { ok: false, message: "You don't have permission to do that." };
  }
  const { supabase, organization } = scope;

  const categories = await listCategories(supabase, organization.id);
  const index = categories.findIndex((category) => category.id === categoryId);
  if (index === -1) return ACTION_OK;

  const swapIndex = direction === "up" ? index - 1 : index + 1;
  if (swapIndex < 0 || swapIndex >= categories.length) return ACTION_OK;

  const current = categories[index];
  const neighbor = categories[swapIndex];

  // sort_order in the WHERE clause (not just id) is an optimistic-concurrency
  // guard: it makes each UPDATE only apply if the row is still at the
  // sort_order this request read moments ago. Two overlapping reorders on
  // the same list (e.g. two browser tabs, or a slow first click followed by
  // a second before the row re-renders) would otherwise both compute swaps
  // from the same stale snapshot and silently stomp each other's write,
  // leaving an order neither caller intended. With the guard, the second
  // one to actually commit affects zero rows -- detectable via .select()'s
  // returned row count -- instead of silently corrupting the order.
  const [a, b] = await Promise.all([
    supabase
      .from("categories")
      .update({ sort_order: neighbor.sortOrder })
      .eq("id", current.id)
      .eq("organization_id", organization.id)
      .eq("sort_order", current.sortOrder)
      .select("id"),
    supabase
      .from("categories")
      .update({ sort_order: current.sortOrder })
      .eq("id", neighbor.id)
      .eq("organization_id", organization.id)
      .eq("sort_order", neighbor.sortOrder)
      .select("id"),
  ]);

  if (a.error || b.error) {
    console.error("moveCategory failed:", a.error ?? b.error);
    return { ok: false, message: "Something went wrong reordering categories." };
  }
  if (!a.data?.length || !b.data?.length) {
    return {
      ok: false,
      message: "This list changed while you were reordering it. Please try again.",
    };
  }

  revalidatePath(CATEGORIES_PATH);
  return ACTION_OK;
}

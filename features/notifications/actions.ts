"use server";

import { revalidatePath } from "next/cache";

import { ACTION_OK, type ActionResult } from "@/lib/action-result";
import { getCurrentUser } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";

/**
 * Scoped by both the row id AND profile_id = auth.uid() -- belt and braces
 * alongside notifications_update_own, which already makes it structurally
 * impossible to mark another user's notification read: an id belonging to
 * someone else simply matches zero rows here, not an authorization error.
 *
 * `.select("id")` + a length check is what makes that distinguishable from
 * "already marked read" at all: Postgres doesn't error on an UPDATE that
 * matches zero rows, so a bad/foreign/already-deleted id would otherwise
 * report the same ACTION_OK as a real success.
 */
export async function markNotificationRead(notificationId: string): Promise<ActionResult> {
  const supabase = await createClient();

  let user;
  try {
    user = await getCurrentUser();
  } catch {
    return { ok: false, message: "Sign in to manage notifications." };
  }

  const { data, error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", notificationId)
    .eq("profile_id", user.id)
    .select("id");

  if (error) {
    console.error("markNotificationRead failed:", error);
    return { ok: false, message: "Something went wrong." };
  }
  if (!data || data.length === 0) {
    return { ok: false, message: "That notification is no longer available." };
  }

  revalidatePath("/dashboard", "layout");
  return ACTION_OK;
}

export async function markAllNotificationsRead(): Promise<ActionResult> {
  const supabase = await createClient();

  let user;
  try {
    user = await getCurrentUser();
  } catch {
    return { ok: false, message: "Sign in to manage notifications." };
  }

  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("profile_id", user.id)
    .is("read_at", null);

  if (error) {
    console.error("markAllNotificationsRead failed:", error);
    return { ok: false, message: "Something went wrong." };
  }

  revalidatePath("/dashboard", "layout");
  return ACTION_OK;
}

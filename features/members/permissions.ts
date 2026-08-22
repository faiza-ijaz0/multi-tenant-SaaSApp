import type { SupabaseClient } from "@supabase/supabase-js";

import { isActionPermissionKey, isPageKey, type ActionPermissionKeyAll, type PageKey } from "@/lib/authorization/registry";

import type { MembershipMutationResult } from "./membership";

export interface MembershipPermissions {
  pages: PageKey[];
  actions: ActionPermissionKeyAll[];
}

/**
 * Loads a single membership's own explicit grant rows. Never a broader
 * org-wide scan -- membership_page_permissions_select/
 * membership_action_permissions_select (0009/0013) both carry a "read your
 * own grants, or read a co-member's if you hold the 'members' page
 * permission" shape, so this works for both "show me my own effective
 * permissions" and "show an admin the roster's permission summary."
 */
export async function getMembershipPermissions(
  supabase: SupabaseClient,
  membershipId: string,
): Promise<MembershipPermissions> {
  const [pagesResult, actionsResult] = await Promise.all([
    supabase.from("membership_page_permissions").select("page").eq("membership_id", membershipId),
    supabase.from("membership_action_permissions").select("permission_key").eq("membership_id", membershipId),
  ]);

  if (pagesResult.error) {
    console.error("getMembershipPermissions: failed to load page permissions:", pagesResult.error);
  }
  if (actionsResult.error) {
    console.error("getMembershipPermissions: failed to load action permissions:", actionsResult.error);
  }

  return {
    pages: (pagesResult.data ?? []).map((row) => row.page as PageKey),
    actions: (actionsResult.data ?? []).map((row) => row.permission_key as ActionPermissionKeyAll),
  };
}

/**
 * Loads every non-owner membership's permission rows in one pair of
 * queries, keyed by membership_id -- used by the Members page roster to
 * show a per-row permission summary without an N+1 query per member.
 */
export async function listMembershipPermissions(
  supabase: SupabaseClient,
  membershipIds: string[],
): Promise<Map<string, MembershipPermissions>> {
  const result = new Map<string, MembershipPermissions>();
  if (membershipIds.length === 0) return result;

  const [pagesResult, actionsResult] = await Promise.all([
    supabase.from("membership_page_permissions").select("membership_id, page").in("membership_id", membershipIds),
    supabase
      .from("membership_action_permissions")
      .select("membership_id, permission_key")
      .in("membership_id", membershipIds),
  ]);

  if (pagesResult.error) {
    console.error("listMembershipPermissions: failed to load page permissions:", pagesResult.error);
  }
  if (actionsResult.error) {
    console.error("listMembershipPermissions: failed to load action permissions:", actionsResult.error);
  }

  for (const id of membershipIds) {
    result.set(id, { pages: [], actions: [] });
  }
  for (const row of pagesResult.data ?? []) {
    result.get(row.membership_id as string)?.pages.push(row.page as PageKey);
  }
  for (const row of actionsResult.data ?? []) {
    result.get(row.membership_id as string)?.actions.push(row.permission_key as ActionPermissionKeyAll);
  }
  return result;
}

/**
 * Writes the EXACT chosen set of page/action grants for one membership --
 * always an explicit diff against the current rows (delete what's no longer
 * checked, insert what's newly checked), never a reference to "the role's
 * preset." can_manage_membership_permissions (0013) is the real
 * authorization boundary underneath every one of these writes: it rejects
 * the caller lacking roles_permissions:manage_permissions, the target being
 * the owner, and the target being the caller's own row -- all independent
 * of anything checked here. This function performs no authorization
 * decisions of its own, matching this codebase's existing
 * "framework-agnostic core" pattern (e.g. updateSubmissionStatusForOrganization).
 */
export async function setMembershipPermissions(
  supabase: SupabaseClient,
  membershipId: string,
  pages: string[],
  actions: string[],
): Promise<MembershipMutationResult> {
  const validPages = pages.filter(isPageKey);
  const validActions = actions.filter(isActionPermissionKey);

  const current = await getMembershipPermissions(supabase, membershipId);
  const currentPages = new Set(current.pages);
  const currentActions = new Set(current.actions);
  const nextPages = new Set(validPages);
  const nextActions = new Set(validActions);

  const pagesToAdd = validPages.filter((page) => !currentPages.has(page));
  const pagesToRemove = current.pages.filter((page) => !nextPages.has(page));
  const actionsToAdd = validActions.filter((key) => !currentActions.has(key));
  const actionsToRemove = current.actions.filter((key) => !nextActions.has(key));

  if (pagesToAdd.length > 0) {
    const { error } = await supabase
      .from("membership_page_permissions")
      .insert(pagesToAdd.map((page) => ({ membership_id: membershipId, page })));
    if (error) {
      console.error("setMembershipPermissions: page insert failed:", error);
      return { ok: false, message: "You don't have permission to change these permissions." };
    }
  }
  if (pagesToRemove.length > 0) {
    const { error } = await supabase
      .from("membership_page_permissions")
      .delete()
      .eq("membership_id", membershipId)
      .in("page", pagesToRemove);
    if (error) {
      console.error("setMembershipPermissions: page delete failed:", error);
      return { ok: false, message: "You don't have permission to change these permissions." };
    }
  }
  if (actionsToAdd.length > 0) {
    const { error } = await supabase
      .from("membership_action_permissions")
      .insert(actionsToAdd.map((permission_key) => ({ membership_id: membershipId, permission_key })));
    if (error) {
      console.error("setMembershipPermissions: action insert failed:", error);
      return { ok: false, message: "You don't have permission to change these permissions." };
    }
  }
  if (actionsToRemove.length > 0) {
    const { error } = await supabase
      .from("membership_action_permissions")
      .delete()
      .eq("membership_id", membershipId)
      .in("permission_key", actionsToRemove);
    if (error) {
      console.error("setMembershipPermissions: action delete failed:", error);
      return { ok: false, message: "You don't have permission to change these permissions." };
    }
  }

  return { ok: true };
}

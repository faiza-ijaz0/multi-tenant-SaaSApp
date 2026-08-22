import { cache } from "react";

import type { TenantScope } from "@/lib/auth/context";

import { type ActionPermissionKeyAll, type PageKey } from "./registry";

export interface EffectivePermissions {
  isOwner: boolean;
  pages: ReadonlySet<PageKey>;
  actions: ReadonlySet<ActionPermissionKeyAll>;
}

/**
 * Resolves the caller's own effective permissions within scope.organization.
 * Mirrors has_page_permission/has_action_permission (0009/0013): an owner
 * bypasses everything unconditionally; anyone else's access is exactly the
 * explicit membership_page_permissions/membership_action_permissions rows
 * on their own membership row.
 *
 * Queries by scope.membership.id specifically (never a broader org-wide
 * scan) -- membership_page_permissions_select and
 * membership_action_permissions_select both carry a "read your own grants"
 * carve-out independent of the 'members' page permission (see 0009's
 * header), so this always succeeds for the caller's own row regardless of
 * what they've been granted.
 *
 * Not memoized beyond a single request (React cache()) -- permission
 * changes must take effect on the next navigation/action, not be cached
 * across requests.
 */
export const getEffectivePermissions = cache(async (scope: TenantScope): Promise<EffectivePermissions> => {
  if (scope.membership.role === "owner") {
    return { isOwner: true, pages: new Set(), actions: new Set() };
  }

  const [pagesResult, actionsResult] = await Promise.all([
    scope.supabase
      .from("membership_page_permissions")
      .select("page")
      .eq("membership_id", scope.membership.id),
    scope.supabase
      .from("membership_action_permissions")
      .select("permission_key")
      .eq("membership_id", scope.membership.id),
  ]);

  if (pagesResult.error) {
    console.error("getEffectivePermissions: failed to load page permissions:", pagesResult.error);
  }
  if (actionsResult.error) {
    console.error("getEffectivePermissions: failed to load action permissions:", actionsResult.error);
  }

  return {
    isOwner: false,
    pages: new Set((pagesResult.data ?? []).map((row) => row.page as PageKey)),
    actions: new Set((actionsResult.data ?? []).map((row) => row.permission_key as ActionPermissionKeyAll)),
  };
});

export function hasPage(permissions: EffectivePermissions, page: PageKey): boolean {
  return permissions.isOwner || permissions.pages.has(page);
}

export function hasAction(permissions: EffectivePermissions, key: ActionPermissionKeyAll): boolean {
  return permissions.isOwner || permissions.actions.has(key);
}

export class PermissionDeniedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermissionDeniedError";
  }
}

/**
 * Throwing variant for Server Components (route guards) and Server Actions.
 * This is an app-level pre-check for a clean error/not-found experience --
 * the RLS policies extended by 0009/0013 remain the actual authorization
 * boundary underneath every query made with scope.supabase, exactly like
 * this codebase's existing requireAdminScope() pattern it replaces.
 */
export async function requirePage(scope: TenantScope, page: PageKey): Promise<EffectivePermissions> {
  const permissions = await getEffectivePermissions(scope);
  if (!hasPage(permissions, page)) {
    throw new PermissionDeniedError(`You don't have access to this page.`);
  }
  return permissions;
}

export async function requireAction(
  scope: TenantScope,
  key: ActionPermissionKeyAll,
): Promise<EffectivePermissions> {
  const permissions = await getEffectivePermissions(scope);
  if (!hasAction(permissions, key)) {
    throw new PermissionDeniedError(`You don't have permission to do that.`);
  }
  return permissions;
}

/**
 * Passes if the caller holds ANY of the given keys. Used where RLS itself
 * ORs two keys together for the same operation -- e.g. submissions:edit /
 * submissions:manage both satisfy submissions_update_author_or_member (see
 * 0013_membership_action_permissions.sql's comment on why "manage" can't
 * have a distinct row-level-security effect from "edit" on the same UPDATE
 * policy). Keep this app-level check in sync with whichever RLS policy it
 * mirrors.
 */
export async function requireAnyAction(
  scope: TenantScope,
  keys: readonly ActionPermissionKeyAll[],
): Promise<EffectivePermissions> {
  const permissions = await getEffectivePermissions(scope);
  if (!keys.some((key) => hasAction(permissions, key))) {
    throw new PermissionDeniedError(`You don't have permission to do that.`);
  }
  return permissions;
}

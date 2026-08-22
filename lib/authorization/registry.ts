import type { OrganizationRole } from "@/lib/auth/types";

/**
 * The nine real dashboard routes a page-permission grant can gate.
 * Mirrors supabase/migrations/0009_page_permissions.sql's CHECK constraint
 * on membership_page_permissions.page (extended by
 * 0015_organization_members_page.sql for `organization_members` and
 * 0016_submissions_page.sql for `submissions`, both below) -- keep both in
 * sync by hand if this list ever changes; there is no single source of
 * truth spanning SQL and TypeScript.
 *
 * The `members` key's underlying database CHECK constraint and route
 * permission plumbing are unchanged since Phase 14 -- Phase 15 only
 * renamed the route (/dashboard/members -> /dashboard/role-management,
 * see components/layout/dashboard-nav-items.ts and next.config.ts's
 * redirect) and the human-readable label (PAGE_LABELS.members below).
 * Renaming the underlying key itself would require a migration to alter
 * the CHECK constraint and rewrite every existing grant row for no real
 * benefit -- the route and the concept it gates ("who can reach member/
 * role management") are the same as before.
 *
 * `organization_members` (Phase 17) gates /dashboard/settings/organization/members
 * (the dedicated "who belongs to this org, remove their membership" page
 * added in Phase 16) -- deliberately its own key, not folded into
 * `settings`/Organization Settings, so the two can be delegated
 * independently (an admin trusted to edit organization name/portal
 * shouldn't automatically also be able to remove members, and vice versa).
 *
 * `submissions` (this phase) gates the newly-separated /dashboard/submissions
 * (full filterable submissions list) and /dashboard/submissions/[id]
 * (detail/comments/status). Previously both lived under `dashboard` (see
 * the superseded reasoning this comment used to carry); now that /dashboard
 * is a distinct overview page (stats + a "Recent submissions" summary card,
 * features/submissions/dashboard-stats.tsx) and /dashboard/submissions is
 * the full management surface, they need their own independent key --
 * `dashboard` deliberately does NOT imply `submissions`, and vice versa
 * (checked live: no existing real membership in this project currently
 * holds `dashboard` without also being an owner, so this split narrows
 * nobody's actual current access).
 *
 * Deliberately does NOT include Comments/Invitations/Roles & Permissions/
 * Portal/Notifications as separate pages, even though the Phase 14 spec's
 * example checkbox list names them individually:
 *   - Comments live under `submissions` (submission detail's own route,
 *     /dashboard/submissions/[id]) -- their granularity is action-level
 *     (see ACTION_PERMISSIONS), not a second page.
 *   - Invitations and Roles & Permissions live under `members` -- there is
 *     no separate route for either.
 *   - Portal is the public, unauthenticated feedback site, not a dashboard
 *     route -- outside this gating system entirely.
 *   - Notifications has no dedicated route (bell dropdown only, always
 *     self-scoped) -- never gated, same as Profile/Account.
 */
export const PAGE_KEYS = [
  "dashboard",
  "submissions",
  "categories",
  "statuses",
  "members",
  "activity",
  "settings",
  "portal_settings",
  "organization_members",
] as const;

export type PageKey = (typeof PAGE_KEYS)[number];

export const PAGE_LABELS: Record<PageKey, string> = {
  dashboard: "Dashboard",
  submissions: "Submissions",
  categories: "Categories",
  statuses: "Statuses",
  members: "Role Management",
  activity: "Activity",
  settings: "Organization Settings",
  portal_settings: "Portal Settings",
  organization_members: "Organization Members",
};

/**
 * Resource:action grants. Mirrors
 * supabase/migrations/0013_membership_action_permissions.sql's CHECK
 * constraint on membership_action_permissions.permission_key -- keep both
 * in sync by hand.
 *
 * Scope decisions (stated explicitly, not guessed):
 *   - `submissions`/`comments` "own row" edit/delete is always allowed via
 *     the author branch already present in RLS (unconditional, no grant
 *     needed) -- these keys gate acting on *someone else's* row.
 *   - `comments:moderate` folds the spec's separate "delete" action for
 *     comments into one key (delete-any and moderate are the same DB-level
 *     capability today; a separate `comments:delete` key would be a
 *     distinction with no behavioral difference).
 *   - `members` has no `edit` key -- editing a member's role/permissions is
 *     `roles_permissions:assign_role`/`roles_permissions:manage_permissions`,
 *     not a generic members-edit action.
 *   - `invitations` has no "resend" key -- email delivery
 *     (features/members/email-delivery.ts) is a documented no-op stub with
 *     no resend code path; a permission for a nonexistent feature would be
 *     invented, not derived.
 *   - `roles_permissions` governs the permission-editor UI and role
 *     dropdown itself -- deliberately absent from the Admin default preset
 *     (see ROLE_PRESETS below), matching the spec's own owner/admin split.
 *   - `portal_settings` collapses the spec's view/edit/manage into one
 *     `edit` key -- view is implicit page access; edit vs. manage has no
 *     distinct behavior in this architecture.
 *   - `organization_settings:edit` exists; organization *delete* is never
 *     a delegable action permission -- it stays a hardcoded owner-only
 *     check, matching the spec's ownership-protection requirements.
 *   - `votes` has no permission surface at all -- the current architecture
 *     has no admin-manage-others'-votes concept (self-only insert/delete,
 *     no admin override policy exists anywhere in RLS).
 */
export const ACTION_PERMISSIONS = {
  submissions: ["view", "create", "edit", "delete", "manage"],
  comments: ["view", "create", "edit", "moderate"],
  categories: ["view", "create", "edit", "delete"],
  statuses: ["view", "create", "edit", "delete"],
  members: ["view", "invite", "delete"],
  invitations: ["view", "create", "revoke"],
  roles_permissions: ["view", "assign_role", "manage_permissions"],
  portal_settings: ["edit"],
  organization_settings: ["edit"],
} as const satisfies Record<string, readonly string[]>;

export type ActionResource = keyof typeof ACTION_PERMISSIONS;

type ActionPermissionKey<R extends ActionResource> = `${R}:${(typeof ACTION_PERMISSIONS)[R][number]}`;

/** Every valid "resource:action" string, e.g. "submissions:edit". */
export type ActionPermissionKeyAll = {
  [R in ActionResource]: ActionPermissionKey<R>;
}[ActionResource];

export const ALL_ACTION_PERMISSION_KEYS: readonly ActionPermissionKeyAll[] = (
  Object.keys(ACTION_PERMISSIONS) as ActionResource[]
).flatMap((resource) =>
  ACTION_PERMISSIONS[resource].map((action) => `${resource}:${action}` as ActionPermissionKeyAll),
);

export const ACTION_LABELS: Record<string, string> = {
  view: "View",
  create: "Create",
  edit: "Edit",
  delete: "Delete",
  manage: "Manage",
  moderate: "Moderate",
  invite: "Invite",
  revoke: "Revoke",
  assign_role: "Assign Role",
  manage_permissions: "Manage Permissions",
};

export const RESOURCE_LABELS: Record<ActionResource, string> = {
  submissions: "Submissions",
  comments: "Comments",
  categories: "Categories",
  statuses: "Statuses",
  members: "Members",
  invitations: "Invitations",
  roles_permissions: "Roles & Permissions",
  portal_settings: "Portal Settings",
  organization_settings: "Organization Settings",
};

export interface PermissionPreset {
  pages: readonly PageKey[];
  actions: readonly ActionPermissionKeyAll[];
}

/**
 * Sensible defaults per role -- a UX convenience for pre-filling the
 * permission editor / invite form, and what the DB migration backfills for
 * every pre-existing membership. Not a stored "mode": every membership
 * always has an explicit, independently editable set of grant rows: saving
 * always writes the exact chosen set, never a reference to "the preset."
 *
 * Owner is intentionally absent -- it bypasses has_page_permission/
 * has_action_permission unconditionally (see 0009/0013) and never holds
 * grant rows.
 */
export const ROLE_PRESETS: Record<Exclude<OrganizationRole, "owner">, PermissionPreset> = {
  admin: {
    pages: [
      "dashboard",
      "submissions",
      "categories",
      "statuses",
      "members",
      "activity",
      "settings",
      "portal_settings",
      "organization_members",
    ],
    // Everything except roles_permissions:assign_role / manage_permissions --
    // an admin can freely manage members/invitations/content, but touching
    // roles or another membership's permissions requires an explicit grant
    // from the owner. This is a deliberate tightening vs. this codebase's
    // current behavior (today any admin can change any non-owner's role) --
    // see the Phase 14 authorization-audit report for the full rationale.
    actions: ALL_ACTION_PERMISSION_KEYS.filter(
      (key) => key !== "roles_permissions:assign_role" && key !== "roles_permissions:manage_permissions",
    ),
  },
  member: {
    // Categories/Statuses view access matches the spec's Member section
    // verbatim ("Categories -> view", "Statuses -> view"); Members/
    // Activity/Settings/Portal Settings are absent by default. `submissions`
    // is included alongside `dashboard` since this preset already grants
    // submissions:view/create -- a Member with those action grants but no
    // page access to actually reach /dashboard/submissions would be a
    // preset that grants a capability with no route to exercise it.
    pages: ["dashboard", "submissions", "categories", "statuses"],
    actions: ["submissions:view", "submissions:create", "comments:view", "comments:create"],
  },
};

export function isPageKey(value: string): value is PageKey {
  return (PAGE_KEYS as readonly string[]).includes(value);
}

export function isActionPermissionKey(value: string): value is ActionPermissionKeyAll {
  return (ALL_ACTION_PERMISSION_KEYS as readonly string[]).includes(value);
}

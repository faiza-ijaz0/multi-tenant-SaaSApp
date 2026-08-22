import type { LucideIcon } from "lucide-react";
import { Activity, CircleDot, Globe, Inbox, LayoutDashboard, Settings, Tags, UserCog, Users } from "lucide-react";

import type { PageKey } from "@/lib/authorization/registry";

/**
 * A serializable identifier for a nav icon -- NOT the component itself.
 * app/dashboard/layout.tsx (a Server Component) builds/filters
 * dashboardNavGroups and passes the result as a prop to DashboardSidebar/
 * DashboardTopbar (Client Components); React Server Components can only
 * serialize plain data across that boundary, never function/component
 * references (a LucideIcon is a function). Client components resolve the
 * actual icon component locally via NAV_ICON_MAP, keyed by this name --
 * see components/layout/dashboard-sidebar.tsx and dashboard-mobile-nav.tsx.
 */
export type NavIconName =
  | "layout-dashboard"
  | "inbox"
  | "tags"
  | "circle-dot"
  | "user-cog"
  | "activity"
  | "settings"
  | "users"
  | "globe";

/**
 * Lives in this shared (non-"use client") module so both the server layout
 * (which never touches this map -- it only ever reads/filters the string
 * `icon` field) and the client nav components (which import this map to
 * resolve a name back to a component) can share one definition. Importing
 * this map from a Server Component is harmless -- it's never assigned to a
 * prop passed to a Client Component, so nothing here crosses the boundary.
 */
export const NAV_ICON_MAP: Record<NavIconName, LucideIcon> = {
  "layout-dashboard": LayoutDashboard,
  inbox: Inbox,
  tags: Tags,
  "circle-dot": CircleDot,
  "user-cog": UserCog,
  activity: Activity,
  settings: Settings,
  users: Users,
  globe: Globe,
};

export interface DashboardNavItem {
  label: string;
  href: string;
  icon: NavIconName;
  /** The page-permission key gating this item -- see lib/authorization/registry.ts. */
  page: PageKey;
}

export interface DashboardNavGroup {
  label: string;
  items: DashboardNavItem[];
}

/**
 * Shared between the desktop sidebar and the mobile nav sheet so the two
 * surfaces can never drift out of sync.
 *
 * Deliberately does not include "Customers" or "Analytics": those pages
 * don't exist yet (no app/dashboard/{customers,analytics} route), and a
 * nav item pointing at a 404 is worse than no nav item. "Members" was
 * removed in Phase 7 for the same reason and restored in Phase 9 now that
 * app/dashboard/role-management/page.tsx actually exists.
 *
 * Grouped (Phase 13) purely for visual/IA structure in the sidebar --
 * every href here still corresponds to a real route, same as the
 * previous flat list.
 */
export const dashboardNavGroups: DashboardNavGroup[] = [
  {
    label: "Overview",
    items: [{ label: "Dashboard", href: "/dashboard", icon: "layout-dashboard", page: "dashboard" }],
  },
  {
    label: "Feedback",
    items: [
      { label: "Submissions", href: "/dashboard/submissions", icon: "inbox", page: "submissions" },
      { label: "Categories", href: "/dashboard/categories", icon: "tags", page: "categories" },
      { label: "Statuses", href: "/dashboard/statuses", icon: "circle-dot", page: "statuses" },
    ],
  },
  {
    label: "Management",
    items: [
      { label: "Role Management", href: "/dashboard/role-management", icon: "user-cog", page: "members" },
      {
        label: "Organization Members",
        href: "/dashboard/settings/organization/members",
        icon: "users",
        page: "organization_members",
      },
      { label: "Activity", href: "/dashboard/activity", icon: "activity", page: "activity" },
    ],
  },
  {
    label: "Settings",
    items: [
      {
        label: "Organization Settings",
        href: "/dashboard/settings/organization",
        icon: "settings",
        page: "settings",
      },
      {
        label: "Portal Settings",
        href: "/dashboard/settings/portal",
        icon: "globe",
        page: "portal_settings",
      },
    ],
  },
];

/** Flat derivation, kept for any consumer that just needs "all items". */
export const dashboardNavItems: DashboardNavItem[] = dashboardNavGroups.flatMap((group) => group.items);

/**
 * Filters groups (and drops any group left with zero items) by the
 * caller's effective page permissions -- see lib/authorization/permissions.ts's
 * hasPage(). Server-computed in app/dashboard/layout.tsx and passed down as
 * a prop, never recomputed client-side from a trusted-client permission set.
 */
export function filterNavGroupsByPages(
  groups: DashboardNavGroup[],
  isPageAllowed: (page: PageKey) => boolean,
): DashboardNavGroup[] {
  return groups
    .map((group) => ({ ...group, items: group.items.filter((item) => isPageAllowed(item.page)) }))
    .filter((group) => group.items.length > 0);
}

/**
 * The first dashboardNavItems entry (canonical nav order: Dashboard,
 * Submissions, Categories, Statuses, Role Management, Organization Members,
 * Activity, Organization Settings, Portal Settings) that `isPageAllowed`
 * grants access to -- used to pick a safe post-login landing page instead
 * of assuming /dashboard (see lib/auth/auth-actions.ts's login()). Since
 * `dashboard` no longer implies `submissions` (or vice versa), a member
 * granted Submissions but not Dashboard correctly lands on
 * /dashboard/submissions here, never on /dashboard followed by an access
 * error. Same "caller passes isPageAllowed, this file never imports the
 * permission resolver itself" shape as filterNavGroupsByPages above.
 * Returns null when no dashboard page is accessible at all.
 */
export function resolveFirstAccessiblePath(isPageAllowed: (page: PageKey) => boolean): string | null {
  return dashboardNavItems.find((item) => isPageAllowed(item.page))?.href ?? null;
}

/**
 * Whether `path` falls under a dashboard nav route `isPageAllowed` grants
 * access to. Matches the *longest* dashboardNavItems href that is a prefix
 * of `path` (so e.g. /dashboard/submissions/123 resolves under the
 * Submissions item's `submissions` page, and /dashboard itself resolves
 * under the Dashboard item's `dashboard` page -- distinct pages/
 * permissions since the dashboard/submissions split) rather than requiring
 * an exact href match -- dashboardNavItems only lists the top-level route
 * per page, not every dynamic sub-route it covers. Portal Settings is now
 * a first-class sidebar item (Settings group) with its own href, so it no
 * longer needs a separate "extra accessible path" carve-out the way it did
 * before it was promoted into the sidebar. Returns false for any path not
 * under a known route at all (e.g. /onboarding); callers decide what to do
 * with those separately -- this function is only ever consulted for paths
 * already known to start with /dashboard.
 */
export function isAccessibleDashboardPath(path: string, isPageAllowed: (page: PageKey) => boolean): boolean {
  let best: DashboardNavItem | null = null;
  for (const item of dashboardNavItems) {
    if (path === item.href || path.startsWith(`${item.href}/`)) {
      if (!best || item.href.length > best.href.length) best = item;
    }
  }
  return best !== null && isPageAllowed(best.page);
}

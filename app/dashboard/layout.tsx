import { DashboardSidebar } from "@/components/layout/dashboard-sidebar";
import { dashboardNavGroups, filterNavGroupsByPages } from "@/components/layout/dashboard-nav-items";
import { DashboardTopbar, type TopbarIdentity } from "@/components/layout/dashboard-topbar";
import { getUnreadNotificationCount, listNotifications } from "@/features/notifications/queries";
import type { Notification } from "@/features/notifications/queries";
import { getTenantScope } from "@/lib/auth/context";
import { getEffectivePermissions, hasPage } from "@/lib/authorization/permissions";
import type { PageKey } from "@/lib/authorization/registry";
import {
  OrganizationAccessDeniedError,
  OrganizationNotFoundError,
  UnauthenticatedError,
} from "@/lib/auth/errors";

interface NotificationBellData {
  notifications: Notification[];
  unreadCount: number;
  error: boolean;
}

/**
 * Next.js signals its own internal control flow (redirect(), notFound(),
 * the build-time "can this route be static?" probe) by throwing an Error
 * tagged with a `digest` string -- these must always be rethrown, never
 * treated as an application error, or they get silently swallowed here
 * instead of reaching the framework. This surfaced for real: without this
 * check, `next build`'s static-render probe (DYNAMIC_SERVER_USAGE, thrown
 * because getTenantScope() reads cookies()) was being logged as a
 * notification-bell failure on every dashboard route.
 */
function isNextInternalSignal(error: unknown): boolean {
  const digest = (error as { digest?: unknown } | null)?.digest;
  return (
    typeof digest === "string" &&
    (digest === "DYNAMIC_SERVER_USAGE" ||
      digest.startsWith("NEXT_REDIRECT") ||
      digest.startsWith("NEXT_NOT_FOUND"))
  );
}

/**
 * getTenantScope() is cache()-memoized per request: this call and each
 * page's own getTenantScope() call (already established since Phase 4/5)
 * share a single underlying auth/membership resolution instead of doing it
 * twice per request -- including replaying the same rejection when there's
 * no session/organization, so the page underneath still gets its own
 * accurate, independent check for its own empty/redirect states.
 *
 * Unauthenticated / no-organization is a normal, expected state here (the
 * page itself already handles showing login redirects or "create an
 * organization" empty states) -- the bell just degrades to empty rather
 * than being a single point of failure for the whole dashboard shell. Only
 * a genuine, unexpected failure sets `error: true`.
 */
async function loadNotificationBellData(): Promise<NotificationBellData> {
  let scope;
  try {
    scope = await getTenantScope();
  } catch (error) {
    if (isNextInternalSignal(error)) throw error;
    if (
      error instanceof UnauthenticatedError ||
      error instanceof OrganizationNotFoundError ||
      error instanceof OrganizationAccessDeniedError
    ) {
      return { notifications: [], unreadCount: 0, error: false };
    }
    console.error("Failed to resolve tenant scope for notification bell:", error);
    return { notifications: [], unreadCount: 0, error: true };
  }

  try {
    const [notifications, unreadCount] = await Promise.all([
      listNotifications(scope.supabase, scope.user.id, {
        organizationId: scope.organization.id,
        limit: 10,
      }),
      getUnreadNotificationCount(scope.supabase, scope.user.id, scope.organization.id),
    ]);
    return { notifications, unreadCount, error: false };
  } catch (error) {
    if (isNextInternalSignal(error)) throw error;
    console.error("Failed to load notifications for the bell:", error);
    return { notifications: [], unreadCount: 0, error: true };
  }
}

interface NavData {
  navGroups: ReturnType<typeof filterNavGroupsByPages>;
}

/**
 * getTenantScope() is cache()-memoized (see loadNotificationBellData's own
 * comment) -- this shares the same underlying resolution as the bell and as
 * whichever page renders under this layout, so permissions are computed
 * once per request, not three times. Never trusts the client for what pages
 * to show: the whole nav-groups list is filtered here, server-side, from
 * the caller's real, RLS-backed grant rows (lib/authorization/permissions.ts),
 * before it ever reaches a Client Component prop. Falls back to the full,
 * unfiltered nav on any failure to resolve a tenant scope -- harmless (a
 * link existing exposes nothing; every route guard re-checks independently)
 * and matches loadNotificationBellData's own graceful-degradation shape.
 */
async function resolveNavData(): Promise<NavData> {
  try {
    const scope = await getTenantScope();
    const permissions = await getEffectivePermissions(scope);
    const isPageAllowed = (page: PageKey) => hasPage(permissions, page);
    return { navGroups: filterNavGroupsByPages(dashboardNavGroups, isPageAllowed) };
  } catch (error) {
    if (isNextInternalSignal(error)) throw error;
    if (
      error instanceof UnauthenticatedError ||
      error instanceof OrganizationNotFoundError ||
      error instanceof OrganizationAccessDeniedError
    ) {
      return { navGroups: dashboardNavGroups };
    }
    console.error("Failed to resolve nav permissions:", error);
    return { navGroups: dashboardNavGroups };
  }
}

/**
 * Resolves the identity block shown in the topbar's welcome text and
 * account-menu popover (email/role/organization). Same graceful-degradation
 * shape as loadNotificationBellData/resolveNavData -- an unauthenticated or
 * no-organization state is normal here (the page underneath already handles
 * its own login redirect / empty state), so this just degrades to `null`
 * rather than failing the whole dashboard shell.
 */
async function resolveTopbarIdentity(): Promise<TopbarIdentity | null> {
  try {
    const scope = await getTenantScope();
    return {
      email: scope.user.email,
      role: scope.membership.role,
      organizationName: scope.organization.name,
    };
  } catch (error) {
    if (isNextInternalSignal(error)) throw error;
    if (
      error instanceof UnauthenticatedError ||
      error instanceof OrganizationNotFoundError ||
      error instanceof OrganizationAccessDeniedError
    ) {
      return null;
    }
    console.error("Failed to resolve topbar identity:", error);
    return null;
  }
}

export default async function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  const [bellData, navData, identity] = await Promise.all([
    loadNotificationBellData(),
    resolveNavData(),
    resolveTopbarIdentity(),
  ]);

  return (
    <div className="flex min-h-svh w-full">
      <DashboardSidebar navGroups={navData.navGroups} />
      <div className="flex min-w-0 flex-1 flex-col">
        <DashboardTopbar
          notifications={bellData.notifications}
          unreadCount={bellData.unreadCount}
          notificationsError={bellData.error}
          navGroups={navData.navGroups}
          identity={identity}
        />
        <main className="flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}

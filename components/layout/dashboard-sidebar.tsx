"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";

import { NAV_ICON_MAP, type DashboardNavGroup, type DashboardNavItem } from "@/components/layout/dashboard-nav-items";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const COLLAPSE_STORAGE_KEY = "signalboard-sidebar-collapsed";
const COLLAPSE_CHANGE_EVENT = "signalboard-sidebar-collapsed-change";

/**
 * useSyncExternalStore, not useState+useEffect: this value genuinely lives
 * outside React (localStorage), and needs to differ between the server
 * snapshot (always "expanded" -- there is no localStorage during SSR) and
 * the client's real persisted value. useSyncExternalStore is the API React
 * provides specifically for this -- it re-renders with the correct client
 * value immediately after hydration without the extra render-then-flip
 * that a manual useEffect(() => setState(...)) causes.
 */
function subscribeToCollapsedChange(callback: () => void): () => void {
  window.addEventListener(COLLAPSE_CHANGE_EVENT, callback);
  return () => window.removeEventListener(COLLAPSE_CHANGE_EVENT, callback);
}

function getCollapsedSnapshot(): boolean {
  return window.localStorage.getItem(COLLAPSE_STORAGE_KEY) === "true";
}

function getCollapsedServerSnapshot(): boolean {
  return false;
}

function setCollapsedPreference(next: boolean): void {
  window.localStorage.setItem(COLLAPSE_STORAGE_KEY, String(next));
  window.dispatchEvent(new Event(COLLAPSE_CHANGE_EVENT));
}

/**
 * Exact match, except a prefix match is also allowed for any href other
 * than the bare "/dashboard" -- without that exception, every dashboard
 * route (e.g. /dashboard/categories) would satisfy
 * pathname.startsWith("/dashboard") and incorrectly highlight the
 * Dashboard nav item everywhere. This also correctly makes Submissions
 * (href "/dashboard/submissions") active on its own detail route,
 * /dashboard/submissions/[id], via the ordinary prefix branch -- Dashboard
 * and Submissions are distinct nav items/pages since the dashboard/
 * submissions split, so this needs no special-casing for that.
 */
function isActiveHref(pathname: string, href: string): boolean {
  return pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
}

/**
 * Collapsed: icon-only, with a tooltip standing in for the now-hidden
 * label (Radix Tooltip, already used elsewhere in this codebase --
 * TooltipProvider is mounted once in app/layout.tsx). Expanded: plain
 * link, no tooltip -- the visible label already says the same thing a
 * tooltip would, so a second copy of it on hover would just be noise.
 */
function NavLink({ item, collapsed, active }: { item: DashboardNavItem; collapsed: boolean; active: boolean }) {
  const Icon = NAV_ICON_MAP[item.icon];

  const link = (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group/nav-link relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sidebar-ring",
        collapsed && "justify-center px-0",
        active
          ? "bg-gradient-to-r from-sidebar-accent to-sidebar-accent/30 text-sidebar-accent-foreground shadow-[inset_0_1px_0_0_hsl(0_0%_100%/0.04)]"
          : "text-sidebar-foreground/65 hover:bg-sidebar-accent/40 hover:text-sidebar-foreground",
      )}
    >
      {active ? (
        <span
          aria-hidden="true"
          className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-sidebar-primary shadow-[0_0_8px_0_var(--sidebar-primary)]"
        />
      ) : null}
      <Icon
        className={cn(
          "size-4 shrink-0 transition-transform duration-150",
          !active && "group-hover/nav-link:scale-110",
        )}
        aria-hidden="true"
      />
      {collapsed ? <span className="sr-only">{item.label}</span> : item.label}
    </Link>
  );

  if (!collapsed) return link;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{item.label}</TooltipContent>
    </Tooltip>
  );
}

export function DashboardSidebar({ navGroups }: { navGroups: DashboardNavGroup[] }) {
  const pathname = usePathname();
  const collapsed = useSyncExternalStore(
    subscribeToCollapsedChange,
    getCollapsedSnapshot,
    getCollapsedServerSnapshot,
  );

  function toggleCollapsed() {
    setCollapsedPreference(!collapsed);
  }

  return (
    <aside
      className={cn(
        "hidden shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-200 ease-out lg:flex",
        collapsed ? "w-[68px]" : "w-64",
      )}
    >
      <div
        className={cn(
          "flex h-14 items-center border-b border-sidebar-border",
          collapsed ? "justify-center px-2" : "justify-between px-4",
        )}
      >
        {collapsed ? null : (
          <Link href="/dashboard" className="flex items-center gap-2.5 text-sidebar-foreground">
            <span
              aria-hidden="true"
              className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-sidebar-primary to-sidebar-primary/70 text-xs font-bold text-sidebar-primary-foreground shadow-[0_2px_8px_-2px_var(--sidebar-primary)]"
            >
              S
            </span>
            <span className="text-sm font-semibold tracking-tight">SignalBoard</span>
          </Link>
        )}
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={toggleCollapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="text-sidebar-foreground/70 transition-colors duration-150 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
        >
          {collapsed ? (
            <PanelLeftOpen className="size-4" aria-hidden="true" />
          ) : (
            <PanelLeftClose className="size-4" aria-hidden="true" />
          )}
        </Button>
      </div>
      <nav aria-label="Dashboard navigation" className="flex-1 space-y-5 overflow-y-auto p-3">
        {navGroups.map((group) => (
          <div key={group.label} className="space-y-1">
            {collapsed ? (
              <div className="mx-2 h-px bg-sidebar-border" aria-hidden="true" />
            ) : (
              <p className="px-3 text-[10.5px] font-semibold tracking-wider text-sidebar-foreground/35 uppercase">
                {group.label}
              </p>
            )}
            {group.items.map((item) => (
              <NavLink
                key={item.href}
                item={item}
                collapsed={collapsed}
                active={isActiveHref(pathname, item.href)}
              />
            ))}
          </div>
        ))}
      </nav>
    </aside>
  );
}

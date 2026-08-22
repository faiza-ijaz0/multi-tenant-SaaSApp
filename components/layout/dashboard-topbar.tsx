"use client";

import { useSyncExternalStore, useTransition } from "react";
import { LogOut, Moon, Sun, UserRound } from "lucide-react";
import { useTheme } from "next-themes";

import { DashboardMobileNav } from "@/components/layout/dashboard-mobile-nav";
import type { DashboardNavGroup } from "@/components/layout/dashboard-nav-items";
import { RoleBadge } from "@/components/domain/role-badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { NotificationBell } from "@/features/notifications/notification-bell";
import type { Notification } from "@/features/notifications/queries";
import { signOut } from "@/lib/auth/auth-actions";
import type { OrganizationRole } from "@/lib/auth/types";

/**
 * Reads the real, currently-applied theme directly off <html>'s class
 * list via useSyncExternalStore -- same pattern as the sidebar's collapsed
 * state (components/layout/dashboard-sidebar.tsx), and for the same
 * reason: this button is visible immediately (not hidden inside a closed
 * dropdown the way the old account-menu theme picker was), so it needs a
 * value that's correct on the very first client render without either a
 * hydration-mismatch warning or a banned setState-in-effect. Watching the
 * class attribute directly is also strictly more accurate than trusting
 * next-themes' own `resolvedTheme` (which has its own documented
 * mount-delay), since the class IS the actual applied theme.
 */
function subscribeToThemeClassChange(callback: () => void): () => void {
  const observer = new MutationObserver(callback);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}

function getIsDarkSnapshot(): boolean {
  return document.documentElement.classList.contains("dark");
}

function getIsDarkServerSnapshot(): boolean {
  return false;
}

/**
 * Deliberately a plain binary Light/Dark toggle in the topbar (not a
 * Light/Dark/System menu) -- moved here from the account dropdown per the
 * explicit design direction that theme switching should be a first-class,
 * one-click topbar control, not buried in a menu. Whichever theme was last
 * explicitly chosen here persists via next-themes' own localStorage
 * handling (unchanged), so "System" is still honored as the *initial*
 * default for a first-time visitor -- it just isn't offered as a manual
 * option in this quick control anymore.
 */
function ThemeToggleButton() {
  const isDark = useSyncExternalStore(subscribeToThemeClassChange, getIsDarkSnapshot, getIsDarkServerSnapshot);
  const { setTheme } = useTheme();

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
          onClick={() => setTheme(isDark ? "light" : "dark")}
        >
          {isDark ? <Sun className="size-4" aria-hidden="true" /> : <Moon className="size-4" aria-hidden="true" />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{isDark ? "Switch to light mode" : "Switch to dark mode"}</TooltipContent>
    </Tooltip>
  );
}

export interface TopbarIdentity {
  email: string | null;
  role: OrganizationRole;
  organizationName: string;
}

/**
 * Replaces the old topbar search input. Real, server-resolved identity
 * (never hardcoded) -- degrades to nothing when `identity` is null (no
 * session/organization yet), same graceful-degradation shape as the rest
 * of this file's data. The email is the visual anchor (medium weight,
 * full size) with "Welcome back" demoted to a small label above it and
 * role/organization demoted to a RoleBadge + name below it -- the same
 * three-tier hierarchy as the account-menu identity block below, so the
 * two never present the same person differently.
 */
function WelcomeText({ identity }: { identity: TopbarIdentity | null }) {
  if (!identity) return <div className="min-w-0 flex-1" />;

  return (
    <div className="hidden min-w-0 flex-1 flex-col justify-center gap-0.5 sm:flex">
      <p className="text-[11px] leading-none font-medium tracking-wide text-muted-foreground/80 uppercase">
        Welcome back
      </p>
      <div className="flex min-w-0 items-center gap-2">
        <p className="truncate text-sm font-semibold text-foreground">{identity.email ?? "Unknown"}</p>
        <span aria-hidden="true" className="hidden h-3 w-px shrink-0 bg-border md:block" />
        <div className="hidden shrink-0 items-center gap-1.5 md:flex">
          <RoleBadge role={identity.role} />
          <span className="truncate text-xs text-muted-foreground">{identity.organizationName}</span>
        </div>
      </div>
    </div>
  );
}

interface DashboardTopbarProps {
  notifications: Notification[];
  unreadCount: number;
  notificationsError: boolean;
  navGroups: DashboardNavGroup[];
  identity: TopbarIdentity | null;
}

export function DashboardTopbar({
  notifications,
  unreadCount,
  notificationsError,
  navGroups,
  identity,
}: DashboardTopbarProps) {
  const [isSigningOut, startSignOutTransition] = useTransition();

  return (
    <header className="flex h-16 shrink-0 items-center gap-3 border-b border-border/70 bg-background/95 px-4 shadow-[0_1px_0_hsl(var(--shadow-color)/0.04)] backdrop-blur-md supports-backdrop-filter:bg-background/80 sm:px-6">
      <DashboardMobileNav navGroups={navGroups} />
      <WelcomeText identity={identity} />
      <div className="ml-auto flex items-center gap-1">
        <ThemeToggleButton />
        <NotificationBell notifications={notifications} unreadCount={unreadCount} error={notificationsError} />
        <div className="mx-1.5 h-6 w-px bg-border" aria-hidden="true" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full transition-all duration-200 hover:bg-transparent hover:ring-2 hover:ring-primary/25"
              aria-label="Open account menu"
            >
              <Avatar className="size-8 ring-2 ring-primary/15 transition-all duration-200">
                <AvatarFallback className="bg-gradient-to-br from-primary/25 to-accent/50 text-primary">
                  <UserRound className="size-4" aria-hidden="true" />
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            {identity ? (
              <>
                <div className="flex items-start gap-2.5 px-2 py-2">
                  <Avatar className="size-9 shrink-0 ring-2 ring-primary/15">
                    <AvatarFallback className="bg-gradient-to-br from-primary/25 to-accent/50 text-primary">
                      <UserRound className="size-4" aria-hidden="true" />
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="truncate text-sm font-semibold text-foreground">{identity.email ?? "Unknown"}</p>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <RoleBadge role={identity.role} />
                      <span className="truncate text-xs text-muted-foreground">{identity.organizationName}</span>
                    </div>
                  </div>
                </div>
                <DropdownMenuSeparator />
              </>
            ) : null}
            <DropdownMenuItem
              variant="destructive"
              disabled={isSigningOut}
              onSelect={() => {
                startSignOutTransition(() => {
                  void signOut();
                });
              }}
            >
              <LogOut className="size-4" aria-hidden="true" />
              {isSigningOut ? "Signing out…" : "Sign out"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

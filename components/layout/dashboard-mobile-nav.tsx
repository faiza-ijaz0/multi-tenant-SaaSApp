"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";

import { NAV_ICON_MAP, type DashboardNavGroup } from "@/components/layout/dashboard-nav-items";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export function DashboardMobileNav({ navGroups }: { navGroups: DashboardNavGroup[] }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation">
          <Menu className="size-5" aria-hidden="true" />
        </Button>
      </SheetTrigger>
      {/* Dark, matching the desktop sidebar -- the same deliberate exception
       * to light/dark mode described in app/globals.css's --sidebar tokens. */}
      <SheetContent side="left" className="w-72 gap-0 bg-sidebar p-0 text-sidebar-foreground">
        <SheetHeader className="border-b border-sidebar-border">
          <SheetTitle className="flex items-center gap-2.5 text-sidebar-foreground">
            <span
              aria-hidden="true"
              className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-sidebar-primary to-sidebar-primary/70 text-xs font-bold text-sidebar-primary-foreground shadow-[0_2px_8px_-2px_var(--sidebar-primary)]"
            >
              S
            </span>
            <span className="text-sm font-semibold tracking-tight">SignalBoard</span>
          </SheetTitle>
        </SheetHeader>
        <nav aria-label="Dashboard navigation" className="space-y-5 p-3">
          {navGroups.map((group) => (
            <div key={group.label} className="space-y-1">
              <p className="px-3 text-[10.5px] font-semibold tracking-wider text-sidebar-foreground/35 uppercase">
                {group.label}
              </p>
              {group.items.map((item) => {
                const isActive =
                  pathname === item.href ||
                  (item.href !== "/dashboard" && pathname.startsWith(item.href));
                const Icon = NAV_ICON_MAP[item.icon];

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={isActive ? "page" : undefined}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150",
                      "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sidebar-ring",
                      isActive
                        ? "bg-gradient-to-r from-sidebar-accent to-sidebar-accent/30 text-sidebar-accent-foreground"
                        : "text-sidebar-foreground/65 hover:bg-sidebar-accent/40 hover:text-sidebar-foreground",
                    )}
                  >
                    {isActive ? (
                      <span
                        aria-hidden="true"
                        className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-sidebar-primary shadow-[0_0_8px_0_var(--sidebar-primary)]"
                      />
                    ) : null}
                    <Icon className="size-4" aria-hidden="true" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
      </SheetContent>
    </Sheet>
  );
}

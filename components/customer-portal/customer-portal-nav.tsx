"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, ListChecks, Menu, UserRound } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { SubmitFeedbackDialog } from "@/components/customer-portal/submit-feedback-dialog";
import type { Category } from "@/features/categories/queries";
import { cn } from "@/lib/utils";

interface CustomerNavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

function buildNavItems(slug: string, isAuthenticated: boolean): CustomerNavItem[] {
  const items: CustomerNavItem[] = [{ label: "Portal Home", href: `/feedback/${slug}`, icon: Home }];
  if (isAuthenticated) {
    items.push(
      { label: "My Feedback", href: `/feedback/${slug}/my-feedback`, icon: ListChecks },
      { label: "Profile", href: `/feedback/${slug}/profile`, icon: UserRound },
    );
  }
  return items;
}

function isItemActive(pathname: string, href: string): boolean {
  return pathname === href;
}

interface CustomerPortalNavProps {
  slug: string;
  isAuthenticated: boolean;
  categories: Category[];
}

/**
 * "Share Feedback" is deliberately not a nav link here -- it's the
 * SubmitFeedbackDialog primary CTA, shown once on desktop (next to this
 * nav, in CustomerPortalHeader) and once more at the top of the mobile
 * sheet (where there's no separate room for a header CTA button next to
 * the hamburger trigger).
 */
export function CustomerPortalNav({ slug, isAuthenticated, categories }: CustomerPortalNavProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const items = buildNavItems(slug, isAuthenticated);

  return (
    <>
      <nav aria-label="Portal navigation" className="hidden items-center gap-1 md:flex">
        {items.map((item) => {
          const isActive = isItemActive(pathname, item.href);
          return (
            <Link
              key={item.label}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "relative rounded-lg px-3 py-1.5 text-sm font-medium transition-all duration-150",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open navigation">
            <Menu className="size-5" aria-hidden="true" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-72 gap-0 p-0">
          <SheetHeader className="border-b border-border">
            <SheetTitle className="flex items-center gap-2.5">
              <span
                aria-hidden="true"
                className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-sky text-xs font-bold text-primary-foreground"
              >
                S
              </span>
              <span className="text-sm font-semibold tracking-tight">SignalBoard</span>
            </SheetTitle>
          </SheetHeader>
          <div className="space-y-4 p-3">
            {isAuthenticated ? (
              <SubmitFeedbackDialog slug={slug} categories={categories} triggerClassName="w-full" />
            ) : null}
            <nav aria-label="Portal navigation" className="space-y-1">
              {items.map((item) => {
                const isActive = isItemActive(pathname, item.href);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.label}
                    href={item.href}
                    aria-current={isActive ? "page" : undefined}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150",
                      isActive
                        ? "bg-gradient-to-r from-primary/12 to-sky/8 text-primary"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <Icon className="size-4" aria-hidden="true" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

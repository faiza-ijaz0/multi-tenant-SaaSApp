"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Menu, X } from "lucide-react";

import { Button } from "@/components/ui/button";

interface MarketingHeaderProps {
  isAuthenticated: boolean;
}

// Every anchor here has a real corresponding section id on "/" -- no
// "Resources"/"Pricing"/"Blog" placeholder, since nothing exists behind
// them yet (see AGENTS.md guidance: don't invent dead links).
const NAV_LINKS = [
  { href: "#product", label: "Product" },
  { href: "#solutions", label: "Solutions" },
  { href: "#how-it-works", label: "How It Works" },
  { href: "#customers", label: "Customers" },
];

/**
 * The only header used on the public marketing "/" route -- deliberately
 * separate from PortalHeader/CustomerPortalHeader (components/customer-portal/*,
 * used by /feedback/*) and DashboardTopbar, which both serve
 * authenticated/portal contexts with different nav needs.
 *
 * Phase 5: two distinct front doors, never mixed. "Sign In" and "Get
 * Started" here are for organization/internal users (-> /login, /signup) --
 * the exact same accounts that manage a workspace at /dashboard. "Customer
 * Portal" is the explicit, separately-styled entry point for external
 * customers (-> /feedback, which itself branches into /feedback/sign-in
 * and /feedback/sign-up). Never point the primary "Sign In" at
 * /feedback/sign-in -- that would silently merge the two audiences this
 * whole phase exists to keep apart.
 */
export function MarketingHeader({ isAuthenticated }: MarketingHeaderProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-background/75 backdrop-blur-lg supports-backdrop-filter:bg-background/60">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2 text-foreground">
          <span
            aria-hidden="true"
            className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-primary/70 text-sm font-semibold text-primary-foreground shadow-[0_2px_8px_hsl(var(--shadow-color)/0.25)]"
          >
            S
          </span>
          <span className="text-base font-semibold tracking-tight">SignalBoard</span>
        </Link>

        <nav aria-label="Primary" className="hidden items-center gap-7 lg:flex">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-2 lg:flex">
          <Link
            href="/feedback"
            className="group/portal-link mr-2 flex items-center gap-1 text-sm font-medium text-sky transition-colors hover:text-sky/80"
          >
            Customer Portal
            <ArrowRight className="size-3.5 transition-transform duration-200 group-hover/portal-link:translate-x-0.5" aria-hidden="true" />
          </Link>
          <span aria-hidden="true" className="h-5 w-px bg-border" />
          {isAuthenticated ? (
            <Button asChild size="sm">
              <Link href="/dashboard">Go to dashboard</Link>
            </Button>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link href="/login">Sign in</Link>
              </Button>
              <Button asChild size="sm">
                <Link href="/signup">Get Started</Link>
              </Button>
            </>
          )}
        </div>

        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen((open) => !open)}
        >
          {mobileOpen ? <X className="size-5" aria-hidden="true" /> : <Menu className="size-5" aria-hidden="true" />}
        </Button>
      </div>

      {mobileOpen ? (
        <div className="border-t border-border/60 bg-background px-4 py-4 lg:hidden">
          <nav aria-label="Primary" className="flex flex-col gap-1">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className="rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                {link.label}
              </a>
            ))}
            <Link
              href="/feedback"
              onClick={() => setMobileOpen(false)}
              className="flex items-center gap-1.5 rounded-lg px-3 py-2.5 text-sm font-medium text-sky hover:bg-sky/8"
            >
              Customer Portal
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </Link>
          </nav>
          <div className="mt-3 flex flex-col gap-2 border-t border-border/60 pt-3">
            {isAuthenticated ? (
              <Button asChild size="sm">
                <Link href="/dashboard">Go to dashboard</Link>
              </Button>
            ) : (
              <>
                <Button asChild variant="outline" size="sm">
                  <Link href="/login">Sign in</Link>
                </Button>
                <Button asChild size="sm">
                  <Link href="/signup">Get Started</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      ) : null}
    </header>
  );
}

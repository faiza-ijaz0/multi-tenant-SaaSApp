import Link from "next/link";

/**
 * Every link here goes to a route or same-page anchor that actually exists
 * (see AGENTS.md guidance: don't invent dead links) -- there is no About/
 * Contact page, so this footer doesn't claim one. Three columns instead of
 * a sparse fourth: Product, Organizations, Customers -- deliberately
 * mirroring Phase 5's two-audience split (Organizations -> /signup,
 * /login; Customers -> /feedback and its sign-in/sign-up), never mixing
 * the two front doors.
 */
export function MarketingFooter() {
  return (
    <footer className="border-t border-border/60 bg-muted/30">
      <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-10 sm:flex-row sm:justify-between">
          <div className="max-w-xs">
            <Link href="/" className="flex items-center gap-2 text-foreground">
              <span
                aria-hidden="true"
                className="flex size-7 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-primary/70 text-sm font-semibold text-primary-foreground"
              >
                S
              </span>
              <span className="text-sm font-semibold tracking-tight">SignalBoard</span>
            </Link>
            <p className="mt-3 text-sm text-muted-foreground">
              The multi-tenant platform for customer feedback and product insights.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
            <div>
              <p className="text-xs font-semibold tracking-wide text-foreground uppercase">Product</p>
              <ul className="mt-3 space-y-2">
                <li>
                  <Link href="/dashboard" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
                    Dashboard
                  </Link>
                </li>
                <li>
                  <a href="#how-it-works" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
                    How it works
                  </a>
                </li>
                <li>
                  <a href="#solutions" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
                    Multi-tenant architecture
                  </a>
                </li>
                <li>
                  <Link href="/feedback" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
                    Customer portal
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <p className="text-xs font-semibold tracking-wide text-foreground uppercase">Organizations</p>
              <ul className="mt-3 space-y-2">
                <li>
                  <Link href="/signup" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
                    Create organization
                  </Link>
                </li>
                <li>
                  <Link href="/login" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
                    Sign in
                  </Link>
                </li>
                <li>
                  <a href="#roles" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
                    Roles &amp; permissions
                  </a>
                </li>
                <li>
                  <a href="#organization" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
                    Organization management
                  </a>
                </li>
              </ul>
            </div>

            <div>
              <p className="text-xs font-semibold tracking-wide text-foreground uppercase">Customers</p>
              <ul className="mt-3 space-y-2">
                <li>
                  <Link href="/feedback" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
                    Customer portal
                  </Link>
                </li>
                <li>
                  <Link href="/feedback/sign-in" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
                    Customer sign in
                  </Link>
                </li>
                <li>
                  <Link href="/feedback/sign-up" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
                    Customer sign up
                  </Link>
                </li>
              </ul>
            </div>
          </div>
        </div>

        <div className="mt-10 flex flex-col gap-2 border-t border-border/60 pt-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>&copy; {new Date().getFullYear()} SignalBoard. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}

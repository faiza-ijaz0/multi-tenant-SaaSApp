import Link from "next/link";

import { Button } from "@/components/ui/button";
import { customerSignOut } from "@/lib/auth/customer-auth-actions";

interface PortalEntryHeaderProps {
  customerEmail: string | null;
}

/**
 * Shared by /feedback (the customer entry hub) and /feedback/portal (the
 * post-auth portal-connect page) -- both are "before a specific
 * organization's portal is open" pages, so neither has an organization/
 * brand identity to show yet (that's CustomerPortalHeader's job, once a
 * slug is resolved). Deliberately simpler than CustomerPortalHeader: no
 * nav, no profile dropdown, just identity + sign out.
 */
export function PortalEntryHeader({ customerEmail }: PortalEntryHeaderProps) {
  return (
    <header className="border-b border-border/60">
      <div className="flex h-16 w-full items-center justify-between">
        <Link href="/" className="flex items-center gap-2 text-foreground">
          <span
            aria-hidden="true"
            className="flex size-7 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-sky text-sm font-semibold text-primary-foreground"
          >
            S
          </span>
          <span className="text-sm font-semibold tracking-tight">SignalBoard</span>
        </Link>

        {customerEmail ? (
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-muted-foreground sm:inline">{customerEmail}</span>
            <form action={customerSignOut}>
              <Button type="submit" variant="ghost" size="sm">
                Sign out
              </Button>
            </form>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link href="/feedback/sign-in">Sign in</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/feedback/sign-up">Get Started</Link>
            </Button>
          </div>
        )}
      </div>
    </header>
  );
}

import Image from "next/image";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { CustomerAccountMenu } from "@/components/customer-portal/customer-account-menu";
import { CustomerPortalNav } from "@/components/customer-portal/customer-portal-nav";
import { SubmitFeedbackDialog } from "@/components/customer-portal/submit-feedback-dialog";
import type { Category } from "@/features/categories/queries";

interface CustomerPortalHeaderProps {
  slug: string;
  portalName: string;
  logoUrl: string | null;
  accentColor: string | null;
  categories: Category[];
  identity: { fullName: string | null; email: string | null } | null;
}

/**
 * The rich, organization-aware header for an open portal
 * (/feedback/[slug]/*) -- distinct from PortalEntryHeader (pre-portal
 * pages) precisely because this one has a real brand/org identity and,
 * once authenticated, a real customer identity to show. Renders for both
 * anonymous and authenticated visitors: an anonymous visitor to a public
 * portal can still browse (existing behavior, preserved), just without the
 * nav items, "Share Feedback" CTA, or account menu that need a real
 * customer identity.
 *
 * logoUrl/accentColor come straight from portal_settings (real org
 * branding, never hardcoded) -- both gracefully degrade: no logo falls back
 * to the SignalBoard mark, and accentColor (already re-validated as a real
 * hex color by sanitizePortalAccentColor before it ever reaches this
 * component) is used only as a small, tasteful indicator dot, never to
 * override the app's own tested primary/sky palette on interactive
 * controls -- an org's chosen brand color isn't guaranteed to have safe
 * contrast for button text.
 */
export function CustomerPortalHeader({
  slug,
  portalName,
  logoUrl,
  accentColor,
  categories,
  identity,
}: CustomerPortalHeaderProps) {
  return (
    <header className="sticky top-0 z-40 -mx-4 mb-6 border-b border-border/60 bg-background/85 px-4 backdrop-blur-lg supports-backdrop-filter:bg-background/70 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
      <div className="flex h-16 w-full items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <Link href="/" className="flex shrink-0 items-center gap-2 text-foreground">
            {logoUrl ? (
              <Image
                src={logoUrl}
                alt=""
                width={28}
                height={28}
                className="size-7 shrink-0 rounded-lg object-cover"
                unoptimized
              />
            ) : (
              <span
                aria-hidden="true"
                className="flex size-7 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-sky text-xs font-bold text-primary-foreground"
              >
                S
              </span>
            )}
          </Link>
          <span aria-hidden="true" className="hidden h-5 w-px bg-border sm:block" />
          <Link
            href={`/feedback/${slug}`}
            className="flex min-w-0 items-center gap-1.5 text-sm font-semibold tracking-tight text-foreground hover:text-primary"
          >
            {accentColor ? (
              <span
                aria-hidden="true"
                className="size-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: accentColor }}
              />
            ) : null}
            <span className="truncate">{portalName}</span>
          </Link>
        </div>

        <div className="flex items-center gap-3">
          <CustomerPortalNav slug={slug} isAuthenticated={Boolean(identity)} categories={categories} />
          {identity ? (
            <>
              <SubmitFeedbackDialog slug={slug} categories={categories} triggerSize="sm" />
              <CustomerAccountMenu slug={slug} fullName={identity.fullName} email={identity.email} />
            </>
          ) : (
            <Button asChild size="sm">
              <Link href={`/feedback/sign-in?next=/feedback/${slug}`}>Sign in</Link>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}

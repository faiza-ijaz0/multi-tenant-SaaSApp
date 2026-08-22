import { KeyRound, MessageSquareText, UserPlus } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { PortalEntryHeader } from "@/components/customer-portal/portal-entry-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth/context";

/**
 * The customer-facing entry hub -- what "Feedback Portal" in the marketing
 * header/footer (components/marketing/*) links to. An authenticated visitor
 * has nothing to do here (they already know how to reach /feedback/portal),
 * so they're sent straight there; this page's real job is onboarding an
 * anonymous visitor into the customer auth flow.
 *
 * Deliberately still no directory of organizations here (see the
 * doc comment this replaced) -- portals live at a specific link shared by
 * each organization, never browsable from this page.
 */
export default async function FeedbackEntryPage() {
  const user = await getCurrentUser().catch(() => null);
  if (user) {
    redirect("/feedback/portal");
  }

  return (
    <div className="flex w-full flex-1 flex-col">
      <PortalEntryHeader customerEmail={null} />
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-16 text-center">
        <div className="relative mb-6">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -inset-6 -z-10 rounded-full bg-gradient-to-br from-primary/25 via-sky/20 to-accent/25 blur-2xl"
          />
          <span className="flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 text-primary ring-1 ring-primary/15">
            <MessageSquareText className="size-6" aria-hidden="true" />
          </span>
        </div>

        <p className="text-xs font-semibold tracking-wide text-primary uppercase">Feedback Portal</p>
        <h1 className="mt-2 max-w-lg font-heading text-3xl font-semibold tracking-tight text-balance text-foreground sm:text-4xl">
          Share feedback with the products you use.
        </h1>
        <p className="mt-4 max-w-md text-sm text-muted-foreground">
          Feedback portals live at a specific link shared by each organization. Sign in or create a
          customer account, then enter the portal link you were given to get started.
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Button asChild size="lg">
            <Link href="/feedback/sign-up">Get Started</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/feedback/sign-in">Sign in</Link>
          </Button>
        </div>

        <div className="mt-14 grid w-full max-w-2xl grid-cols-1 gap-4 sm:grid-cols-2">
          <Card className="border-border/60">
            <CardContent className="flex items-start gap-3 text-left">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary/18 to-primary/5 text-primary ring-1 ring-primary/15">
                <UserPlus className="size-4" aria-hidden="true" />
              </span>
              <div>
                <p className="text-sm font-medium text-foreground">Create a customer account</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  One account works across every organization&apos;s portal you&apos;re invited to.
                </p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border/60">
            <CardContent className="flex items-start gap-3 text-left">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-sky/22 to-sky/5 text-sky ring-1 ring-sky/20">
                <KeyRound className="size-4" aria-hidden="true" />
              </span>
              <div>
                <p className="text-sm font-medium text-foreground">Have a portal link?</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Sign in, then paste the link your organization shared to open their portal.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

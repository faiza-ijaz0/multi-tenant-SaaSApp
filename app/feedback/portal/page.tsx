import { Building2, LinkIcon } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { PortalEntryHeader } from "@/components/customer-portal/portal-entry-header";
import { PortalEntryForm } from "@/components/customer-portal/portal-entry-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listRecentCustomerPortals } from "@/features/customers/queries";
import { getCurrentUser } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";

/**
 * The post-auth "connect to your feedback portal" page (step 7-8 of the
 * customer journey). Requires a real session -- redirects to the
 * customer-facing sign-in, never /login, so an unauthenticated visitor is
 * never shown internal-dashboard-branded chrome. Portal resolution itself
 * happens server-side in resolvePortalEntry (features/customers/
 * resolve-portal-entry.ts); this page never accepts or trusts an
 * organization id from the client.
 */
export default async function PortalEntryPage() {
  const user = await getCurrentUser().catch(() => null);
  if (!user) {
    redirect("/feedback/sign-in?next=/feedback/portal");
  }

  const supabase = await createClient();
  const recentPortals = await listRecentCustomerPortals(supabase, user.id);

  return (
    <div className="flex w-full flex-1 flex-col">
      <PortalEntryHeader customerEmail={user.email} />

      <div className="flex flex-1 flex-col items-center justify-center px-4 py-16">
        <div className="w-full max-w-md">
          <div className="relative">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -inset-8 -z-10 rounded-[2rem] bg-gradient-to-br from-primary/20 via-sky/15 to-accent/20 opacity-70 blur-2xl"
            />
            <Card className="border-border/60 shadow-[0_24px_60px_-24px_hsl(var(--shadow-color)/0.35)] ring-1 ring-foreground/5">
              <CardHeader>
                <span className="flex size-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 text-primary ring-1 ring-primary/15">
                  <LinkIcon className="size-5" aria-hidden="true" />
                </span>
                <CardTitle className="mt-3 text-xl">Connect to your feedback portal</CardTitle>
                <CardDescription>
                  Enter the portal link provided by the organization you want to share feedback with.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <PortalEntryForm />
              </CardContent>
            </Card>
          </div>

          {recentPortals.length > 0 ? (
            <div className="mt-8">
              <p className="px-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Your recent portals
              </p>
              <div className="mt-3 space-y-2">
                {recentPortals.map((portal) => (
                  <Link
                    key={portal.organizationId}
                    href={`/feedback/${portal.slug}`}
                    className="group flex items-center gap-3 rounded-xl border border-border/70 bg-card px-4 py-3 shadow-[0_1px_2px_hsl(var(--shadow-color)/0.06)] transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-md"
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-sky/22 to-sky/5 text-sky ring-1 ring-sky/20">
                      <Building2 className="size-4" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        {portal.brandName ?? portal.organizationName}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">/feedback/{portal.slug}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

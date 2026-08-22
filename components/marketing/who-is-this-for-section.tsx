import Link from "next/link";
import { ArrowRight, MessageSquareHeart, Users } from "lucide-react";

/**
 * Deliberately the first thing after the hero -- the two audiences and
 * their two separate front doors (Phase 5's core requirement) need to be
 * unmistakable before a visitor reads anything else. Each card's CTA goes
 * straight to that audience's real entry point: organizations to /signup,
 * customers to /feedback (never /feedback/sign-up directly -- customer
 * signup happens *inside* the portal flow, not from the marketing site).
 */
export function WhoIsThisForSection() {
  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 sm:py-24 lg:px-8">
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-xs font-semibold tracking-wide text-primary uppercase">Who it&apos;s for</p>
        <h2 className="mt-3 font-heading text-3xl font-semibold tracking-tight text-balance text-foreground sm:text-4xl">
          Two experiences, one platform.
        </h2>
      </div>

      <div className="mt-14 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="group relative overflow-hidden rounded-3xl border border-border/70 bg-gradient-to-br from-card via-card to-primary/5 p-8 shadow-[0_1px_2px_hsl(var(--shadow-color)/0.06)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_20px_50px_-20px_hsl(var(--shadow-color)/0.3)] sm:p-10">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-10 -right-10 size-40 rounded-full bg-primary/10 blur-3xl transition-opacity duration-300 group-hover:opacity-150"
          />
          <span className="relative flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 text-primary ring-1 ring-primary/15">
            <Users className="size-6" aria-hidden="true" />
          </span>
          <h3 className="relative mt-5 font-heading text-xl font-semibold text-foreground">For Product Teams</h3>
          <p className="relative mt-2 text-sm leading-relaxed text-muted-foreground">
            Create your organization and turn customer feedback into actionable product insights -- with your
            own team, roles, and workspace.
          </p>
          <Link
            href="/signup"
            className="group/cta relative mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-primary"
          >
            Create your organization
            <ArrowRight className="size-4 transition-transform duration-200 group-hover/cta:translate-x-0.5" aria-hidden="true" />
          </Link>
        </div>

        <div className="group relative overflow-hidden rounded-3xl border border-border/70 bg-gradient-to-br from-card via-card to-sky/5 p-8 shadow-[0_1px_2px_hsl(var(--shadow-color)/0.06)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_20px_50px_-20px_hsl(var(--shadow-color)/0.3)] sm:p-10">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-10 -right-10 size-40 rounded-full bg-sky/15 blur-3xl transition-opacity duration-300 group-hover:opacity-150"
          />
          <span className="relative flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-sky/25 to-sky/5 text-sky ring-1 ring-sky/20">
            <MessageSquareHeart className="size-6" aria-hidden="true" />
          </span>
          <h3 className="relative mt-5 font-heading text-xl font-semibold text-foreground">For Customers</h3>
          <p className="relative mt-2 text-sm leading-relaxed text-muted-foreground">
            Share feedback, track your requests, and stay connected with the products you use -- all from
            your own customer account.
          </p>
          <Link
            href="/feedback"
            className="group/cta relative mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-sky"
          >
            Customer Portal
            <ArrowRight className="size-4 transition-transform duration-200 group-hover/cta:translate-x-0.5" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </section>
  );
}

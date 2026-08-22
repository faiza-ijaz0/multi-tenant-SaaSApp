import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { HeroPreview } from "@/components/marketing/hero-preview";

interface HeroSectionProps {
  /** /dashboard when already signed in as an internal org user, /signup
   * otherwise -- never a customer-portal route (Phase 5: the primary
   * marketing CTA is always the organization/workspace flow). */
  primaryHref: string;
  primaryLabel: string;
}

export function HeroSection({ primaryHref, primaryLabel }: HeroSectionProps) {
  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 [mask-image:linear-gradient(to_bottom,black,transparent)]"
      >
        <div className="absolute top-[-12rem] left-1/2 h-[36rem] w-[64rem] -translate-x-1/2 rounded-full bg-gradient-to-br from-primary/20 via-sky/15 to-accent/25 blur-3xl" />
        <div
          className="absolute inset-0 opacity-[0.35] dark:opacity-[0.2]"
          style={{
            backgroundImage:
              "linear-gradient(to right, hsl(var(--shadow-color) / 0.06) 1px, transparent 1px), linear-gradient(to bottom, hsl(var(--shadow-color) / 0.06) 1px, transparent 1px)",
            backgroundSize: "56px 56px",
          }}
        />
      </div>

      <div className="mx-auto grid w-full max-w-6xl grid-cols-1 items-center gap-12 px-4 py-20 sm:px-6 sm:py-28 lg:grid-cols-2 lg:gap-16 lg:px-8 lg:py-32">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/8 px-3 py-1 text-xs font-medium text-primary">
            <Sparkles className="size-3.5" aria-hidden="true" />
            Multi-Tenant Customer Feedback Platform
          </span>

          <h1 className="mt-5 font-heading text-4xl leading-[1.08] font-semibold tracking-tight text-balance text-foreground sm:text-5xl lg:text-[3.4rem]">
            Turn customer feedback into{" "}
            <span className="bg-gradient-to-r from-primary via-primary to-sky bg-clip-text text-transparent">
              product decisions
            </span>
            .
          </h1>

          <p className="mt-6 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            SignalBoard gives every organization its own isolated workspace to collect feedback, organize it
            into categories and statuses, and collaborate as a team. Spot the trends that matter and turn
            what customers are telling you into decisions you can act on.
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button asChild size="lg" className="h-11 px-6 text-sm">
              <Link href={primaryHref}>
                {primaryLabel}
                <ArrowRight className="size-4 transition-transform duration-200 group-hover/button:translate-x-0.5" data-icon="inline-end" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="h-11 px-6 text-sm">
              <Link href="/feedback">Explore Customer Portal</Link>
            </Button>
          </div>

          <p className="mt-5 text-xs text-muted-foreground">
            No credit card required &middot; Set up your workspace in minutes
          </p>
        </div>

        <div className="lg:pl-4">
          <HeroPreview />
        </div>
      </div>
    </section>
  );
}

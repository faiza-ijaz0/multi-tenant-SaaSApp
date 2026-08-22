import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Building2,
  LayoutGrid,
  Rocket,
  UsersRound,
  Wrench,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

interface LifecycleStep {
  number: string;
  icon: LucideIcon;
  title: string;
  description: string;
}

const STEPS: LifecycleStep[] = [
  {
    number: "01",
    icon: Building2,
    title: "Create your organization",
    description: "Create your SignalBoard workspace and establish your organization.",
  },
  {
    number: "02",
    icon: Wrench,
    title: "Build your workspace",
    description: "Configure categories, statuses, roles, members, portal settings, and branding.",
  },
  {
    number: "03",
    icon: Rocket,
    title: "Launch your feedback portal",
    description: "Set up your customer-facing feedback portal and share it with customers.",
  },
  {
    number: "04",
    icon: UsersRound,
    title: "Customers submit feedback",
    description: "Customers create their own accounts and submit feedback through the Customer Portal.",
  },
  {
    number: "05",
    icon: LayoutGrid,
    title: "Your team manages feedback",
    description: "Review submissions, categorize feedback, update statuses, and collaborate as a team.",
  },
  {
    number: "06",
    icon: BarChart3,
    title: "Turn feedback into insights",
    description: "Use dashboard analytics and activity to understand trends, categories, and activity over time.",
  },
];

/**
 * "How your organization works" -- the full org-side lifecycle, distinct
 * from CustomerJourneySection (the customer-side loop). Every step maps to
 * a real, existing capability (features/categories, features/statuses,
 * dashboard/role-management, features/portal-settings, the customer
 * portal, dashboard/submissions, dashboard/activity + components/analytics)
 * -- nothing here describes a feature that doesn't exist.
 */
export function OrganizationLifecycleSection() {
  return (
    <section id="how-it-works" className="border-y border-border/60 bg-muted/30">
      <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold tracking-wide text-primary uppercase">How your organization works</p>
          <h2 className="mt-3 font-heading text-3xl font-semibold tracking-tight text-balance text-foreground sm:text-4xl">
            From workspace to product decisions.
          </h2>
          <p className="mt-4 text-base text-muted-foreground">
            Every organization moves through the same lifecycle -- set up your workspace once, then run it.
          </p>
        </div>

        <div className="mt-14 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {STEPS.map((step) => {
            const Icon = step.icon;
            return (
              <div
                key={step.number}
                className="group relative flex flex-col overflow-hidden rounded-2xl border border-border/70 bg-card p-6 shadow-[0_1px_2px_hsl(var(--shadow-color)/0.06)] transition-all duration-300 hover:-translate-y-1 hover:border-primary/25 hover:shadow-[0_16px_40px_-16px_hsl(var(--shadow-color)/0.3)]"
              >
                <div className="flex items-center justify-between">
                  <span className="flex size-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 text-primary ring-1 ring-primary/15 transition-transform duration-300 group-hover:scale-110">
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                  <span className="font-heading text-2xl font-semibold text-foreground/15">{step.number}</span>
                </div>
                <h3 className="mt-4 font-heading text-base font-semibold text-foreground">{step.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{step.description}</p>
                {step.number === "01" ? (
                  <Button asChild size="sm" variant="outline" className="mt-4 w-fit">
                    <Link href="/signup">
                      Create your organization
                      <ArrowRight className="size-3.5" data-icon="inline-end" aria-hidden="true" />
                    </Link>
                  </Button>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

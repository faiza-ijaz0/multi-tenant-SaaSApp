import { ArrowRight, ArrowDown } from "lucide-react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Building2,
  ClipboardCheck,
  KeyRound,
  MessageSquarePlus,
  Rocket,
  Share2,
  UserPlus,
  Wrench,
} from "lucide-react";

import { Button } from "@/components/ui/button";

interface JourneyStep {
  icon: LucideIcon;
  label: string;
  owner: "org" | "customer";
}

const STEPS: JourneyStep[] = [
  { icon: Building2, label: "Organization creates workspace", owner: "org" },
  { icon: Wrench, label: "Organization configures portal", owner: "org" },
  { icon: Share2, label: "Organization shares portal", owner: "org" },
  { icon: Rocket, label: "Customer visits portal", owner: "customer" },
  { icon: UserPlus, label: "Customer creates account", owner: "customer" },
  { icon: MessageSquarePlus, label: "Customer submits feedback", owner: "customer" },
  { icon: KeyRound, label: "Customer tracks their feedback", owner: "customer" },
  { icon: ClipboardCheck, label: "Organization reviews & manages", owner: "org" },
  { icon: BarChart3, label: "Insights appear in the dashboard", owner: "org" },
];

const OWNER_CLASSNAMES: Record<JourneyStep["owner"], string> = {
  org: "bg-gradient-to-br from-primary/18 to-primary/5 text-primary ring-1 ring-primary/15",
  customer: "bg-gradient-to-br from-sky/22 to-sky/5 text-sky ring-1 ring-sky/20",
};

/**
 * The customer-side loop, kept deliberately distinct from
 * OrganizationLifecycleSection (the org-side setup lifecycle) -- this one
 * shows how an organization's and a customer's actions interleave, from
 * portal creation through feedback back into the organization's own
 * dashboard. Color alone (primary vs sky) marks who performs each step, so
 * the loop reads correctly even at a glance.
 */
export function CustomerJourneySection() {
  return (
    <section id="customers" className="mx-auto w-full max-w-4xl px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-xs font-semibold tracking-wide text-sky uppercase">The customer journey</p>
        <h2 className="mt-3 font-heading text-3xl font-semibold tracking-tight text-balance text-foreground sm:text-4xl">
          From a shared link to a product decision.
        </h2>
        <p className="mt-4 text-base text-muted-foreground">
          Two audiences, one continuous loop -- organizations launch the portal, customers use it, and
          feedback flows straight back into the team&apos;s dashboard.
        </p>
        <div className="mt-5 flex items-center justify-center gap-4 text-xs font-medium">
          <span className="flex items-center gap-1.5 text-primary">
            <span aria-hidden="true" className="size-2 rounded-full bg-primary" />
            Organization
          </span>
          <span className="flex items-center gap-1.5 text-sky">
            <span aria-hidden="true" className="size-2 rounded-full bg-sky" />
            Customer
          </span>
        </div>
      </div>

      <div className="mt-14 flex flex-col items-center">
        {STEPS.map((step, index) => {
          const Icon = step.icon;
          return (
            <div key={step.label} className="flex w-full max-w-md flex-col items-center">
              <div className="flex w-full items-center gap-3 rounded-xl border border-border/70 bg-card px-4 py-3 shadow-[0_1px_2px_hsl(var(--shadow-color)/0.06)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
                <span className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${OWNER_CLASSNAMES[step.owner]}`}>
                  <Icon className="size-4.5" aria-hidden="true" />
                </span>
                <p className="text-sm font-medium text-foreground">{step.label}</p>
              </div>
              {index < STEPS.length - 1 ? (
                <ArrowDown className="my-1.5 size-3.5 text-muted-foreground/40" aria-hidden="true" />
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="mt-10 flex justify-center">
        <Button asChild size="lg" variant="outline">
          <Link href="/feedback">
            Access Customer Portal
            <ArrowRight className="size-4" data-icon="inline-end" aria-hidden="true" />
          </Link>
        </Button>
      </div>
    </section>
  );
}

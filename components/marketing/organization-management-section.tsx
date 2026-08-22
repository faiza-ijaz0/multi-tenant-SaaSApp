import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Building2,
  KeyRound,
  MessageSquareHeart,
  UsersRound,
  Wrench,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

interface ChainNode {
  icon: LucideIcon;
  label: string;
}

const CHAIN: ChainNode[] = [
  { icon: Building2, label: "Organization" },
  { icon: Wrench, label: "Workspace" },
  { icon: UsersRound, label: "Team" },
  { icon: KeyRound, label: "Roles & Permissions" },
  { icon: MessageSquareHeart, label: "Feedback Portal" },
  { icon: BarChart3, label: "Insights" },
];

export function OrganizationManagementSection() {
  return (
    <section id="organization" className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
      <div className="grid grid-cols-1 items-center gap-14 lg:grid-cols-2">
        <div>
          <p className="text-xs font-semibold tracking-wide text-primary uppercase">Organization management</p>
          <h2 className="mt-3 font-heading text-3xl font-semibold tracking-tight text-balance text-foreground sm:text-4xl">
            Built for the teams behind the feedback.
          </h2>
          <div className="mt-5 space-y-3 text-sm leading-relaxed text-muted-foreground">
            <p>Owners establish the organization and manage its workspace end to end.</p>
            <p>Teams can hold different roles, each with their own permissions.</p>
            <p>Members get access to exactly the areas they need -- nothing more.</p>
            <p>Every organization manages its own customer feedback independently.</p>
          </div>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button asChild>
              <Link href="/signup">
                Create your organization
                <ArrowRight className="size-4" data-icon="inline-end" aria-hidden="true" />
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/login">Sign in to your workspace</Link>
            </Button>
          </div>
        </div>

        <div className="relative">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -inset-6 -z-10 rounded-[2rem] bg-gradient-to-br from-primary/15 via-sky/10 to-accent/15 opacity-70 blur-2xl"
          />
          <div className="flex flex-col items-stretch">
            {CHAIN.map((node, index) => {
              const Icon = node.icon;
              return (
                <div key={node.label} className="flex flex-col items-center">
                  <div className="flex w-full items-center gap-3 rounded-xl border border-border/70 bg-card px-4 py-3 shadow-[0_1px_2px_hsl(var(--shadow-color)/0.06)] transition-all duration-200 hover:border-primary/25 hover:shadow-md">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary/18 to-primary/5 text-primary ring-1 ring-primary/15">
                      <Icon className="size-4.5" aria-hidden="true" />
                    </span>
                    <p className="text-sm font-medium text-foreground">{node.label}</p>
                  </div>
                  {index < CHAIN.length - 1 ? (
                    <span aria-hidden="true" className="my-1 h-4 w-px bg-border" />
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

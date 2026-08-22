import { Database, Layers, ShieldCheck, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface TrustPoint {
  icon: LucideIcon;
  title: string;
  description: string;
}

const TRUST_POINTS: TrustPoint[] = [
  {
    icon: Database,
    title: "Centralized feedback",
    description: "Every submission, from every customer, lives in one organized workspace instead of scattered threads and inboxes.",
  },
  {
    icon: Layers,
    title: "Organized product intelligence",
    description: "Categories and statuses turn raw feedback into a structured view your whole team can navigate.",
  },
  {
    icon: ShieldCheck,
    title: "Secure customer access",
    description: "Customer accounts are scoped to their own organization's portal, with access enforced at the data layer.",
  },
  {
    icon: Users,
    title: "Role-based internal management",
    description: "Give teammates the right level of access -- from viewing submissions to managing categories, statuses, and members.",
  },
];

export function TrustSection() {
  return (
    <section id="trust" className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
      <div className="relative overflow-hidden rounded-3xl border border-border/70 bg-gradient-to-br from-card via-card to-primary/5 px-6 py-14 shadow-[0_20px_60px_-24px_hsl(var(--shadow-color)/0.3)] ring-1 ring-foreground/5 sm:px-12 sm:py-16">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute top-0 right-0 size-72 rounded-full bg-primary/10 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute bottom-0 left-0 size-72 rounded-full bg-sky/10 blur-3xl"
        />

        <div className="relative mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold tracking-wide text-primary uppercase">Enterprise-ready</p>
          <h2 className="mt-3 font-heading text-3xl font-semibold tracking-tight text-balance text-foreground sm:text-4xl">
            One organized system, built for real teams.
          </h2>
        </div>

        <div className="relative mt-14 grid grid-cols-1 gap-6 sm:grid-cols-2">
          {TRUST_POINTS.map((point) => {
            const Icon = point.icon;
            return (
              <div
                key={point.title}
                className="flex items-start gap-4 rounded-2xl border border-border/60 bg-background/60 p-5 backdrop-blur-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-md"
              >
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 text-primary ring-1 ring-primary/15">
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <div>
                  <h3 className="font-heading text-base font-semibold text-foreground">{point.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{point.description}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

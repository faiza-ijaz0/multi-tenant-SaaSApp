import { Inbox, LayoutGrid, LineChart, ListFilter } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface FeatureCard {
  icon: LucideIcon;
  title: string;
  description: string;
  accent: "primary" | "sky" | "warning" | "info";
}

const FEATURES: FeatureCard[] = [
  {
    icon: Inbox,
    title: "Collect Feedback",
    description:
      "Give every customer a dedicated portal to submit ideas, bugs, and requests -- no spreadsheets, forwarded emails, or lost context.",
    accent: "primary",
  },
  {
    icon: LayoutGrid,
    title: "Organize & Categorize",
    description:
      "Sort incoming feedback into categories and statuses that match how your team actually plans work, automatically kept tidy.",
    accent: "sky",
  },
  {
    icon: ListFilter,
    title: "Prioritize What Matters",
    description:
      "Votes and activity surface what customers care about most, so the loudest signal in the room is the one you act on first.",
    accent: "warning",
  },
  {
    icon: LineChart,
    title: "Discover Product Insights",
    description:
      "Roll individual submissions up into trends and patterns your team can use to make confident, customer-informed decisions.",
    accent: "info",
  },
];

const ICON_CLASSNAMES: Record<FeatureCard["accent"], string> = {
  primary: "bg-gradient-to-br from-primary/20 to-primary/5 text-primary ring-1 ring-primary/15",
  sky: "bg-gradient-to-br from-sky/25 to-sky/5 text-sky ring-1 ring-sky/20",
  warning: "bg-gradient-to-br from-warning/20 to-warning/5 text-warning ring-1 ring-warning/15",
  info: "bg-gradient-to-br from-info/20 to-info/5 text-info ring-1 ring-info/15",
};

const GLOW_CLASSNAMES: Record<FeatureCard["accent"], string> = {
  primary: "bg-primary/15",
  sky: "bg-sky/20",
  warning: "bg-warning/15",
  info: "bg-info/15",
};

export function ValuePropsSection() {
  return (
    <section id="product" className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-xs font-semibold tracking-wide text-primary uppercase">Why SignalBoard</p>
        <h2 className="mt-3 font-heading text-3xl font-semibold tracking-tight text-balance text-foreground sm:text-4xl">
          Turn customer feedback into product insight.
        </h2>
        <p className="mt-4 text-base text-muted-foreground">
          One workspace to collect what customers are telling you and turn it into decisions your team can act on.
        </p>
      </div>

      <div className="mt-14 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map((feature) => {
          const Icon = feature.icon;
          return (
            <div
              key={feature.title}
              className="group relative overflow-hidden rounded-2xl border border-border/70 bg-card p-6 shadow-[0_1px_2px_hsl(var(--shadow-color)/0.06)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_16px_40px_-16px_hsl(var(--shadow-color)/0.3)]"
            >
              <div
                aria-hidden="true"
                className={`pointer-events-none absolute -top-10 -right-10 size-28 rounded-full opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-100 ${GLOW_CLASSNAMES[feature.accent]}`}
              />
              <div
                className={`relative flex size-12 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-110 ${ICON_CLASSNAMES[feature.accent]}`}
              >
                <Icon className="size-5.5" aria-hidden="true" />
              </div>
              <h3 className="relative mt-5 font-heading text-base font-semibold text-foreground">{feature.title}</h3>
              <p className="relative mt-2 text-sm leading-relaxed text-muted-foreground">{feature.description}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

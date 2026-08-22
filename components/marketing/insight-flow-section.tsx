import { ArrowRight, BarChart3, ListChecks, MessageSquareText, Sparkles, Tags, TrendingUp } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface FlowNode {
  icon: LucideIcon;
  label: string;
  accent: "primary" | "sky" | "info" | "warning" | "success";
}

// Maps 1:1 to real, existing product concepts -- Submissions, Categories,
// votes (Prioritize), Statuses, Activity/Analytics -- never an invented
// pipeline stage.
const FLOW: FlowNode[] = [
  { icon: MessageSquareText, label: "Customer Feedback", accent: "primary" },
  { icon: Tags, label: "Categorize", accent: "sky" },
  { icon: ListChecks, label: "Prioritize", accent: "warning" },
  { icon: TrendingUp, label: "Track Status", accent: "info" },
  { icon: BarChart3, label: "Analyze Trends", accent: "info" },
  { icon: Sparkles, label: "Product Decisions", accent: "success" },
];

const ICON_CLASSNAMES: Record<FlowNode["accent"], string> = {
  primary: "bg-gradient-to-br from-primary/20 to-primary/5 text-primary ring-1 ring-primary/15",
  sky: "bg-gradient-to-br from-sky/25 to-sky/5 text-sky ring-1 ring-sky/20",
  info: "bg-gradient-to-br from-info/20 to-info/5 text-info ring-1 ring-info/15",
  warning: "bg-gradient-to-br from-warning/20 to-warning/5 text-warning ring-1 ring-warning/15",
  success: "bg-gradient-to-br from-success/20 to-success/5 text-success ring-1 ring-success/15",
};

export function InsightFlowSection() {
  return (
    <section className="relative overflow-hidden bg-muted/30">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-transparent via-primary/[0.03] to-transparent"
      />
      <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold tracking-wide text-primary uppercase">From feedback to decision</p>
          <h2 className="mt-3 font-heading text-3xl font-semibold tracking-tight text-balance text-foreground sm:text-4xl">
            From customer voice to product decisions.
          </h2>
          <p className="mt-4 text-base text-muted-foreground">
            Every submission your customers send becomes structured, organized signal your team can actually use --
            not another unread inbox.
          </p>
        </div>

        <div className="mt-16 flex flex-col items-stretch gap-3 lg:flex-row lg:items-center lg:gap-3">
          {FLOW.map((node, i) => {
            const Icon = node.icon;
            return (
              <div key={node.label} className="flex flex-1 flex-col items-center gap-3 lg:flex-row">
                <div className="flex w-full flex-1 flex-col items-center gap-3 rounded-2xl border border-border/70 bg-card px-4 py-6 text-center shadow-[0_1px_2px_hsl(var(--shadow-color)/0.06)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_16px_36px_-16px_hsl(var(--shadow-color)/0.3)]">
                  <span className={`flex size-11 items-center justify-center rounded-xl ${ICON_CLASSNAMES[node.accent]}`}>
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                  <p className="text-sm font-semibold text-foreground">{node.label}</p>
                </div>
                {i < FLOW.length - 1 ? (
                  <ArrowRight
                    className="size-4 shrink-0 rotate-90 text-muted-foreground/50 lg:rotate-0"
                    aria-hidden="true"
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

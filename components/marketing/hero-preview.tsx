import { ArrowUpRight, MessageSquareText, TrendingUp } from "lucide-react";

/**
 * Purely illustrative marketing artwork -- every label and number here is
 * hand-authored sample copy, not a query result. It never imports from
 * features/* or touches Supabase, so there is no path by which real
 * submission/customer data could end up on the public "/" route.
 */
const SAMPLE_SUBMISSIONS = [
  { title: "Bulk export for submissions", category: "Feature request", status: "In review", statusAccent: "bg-info" },
  { title: "Slow load on the activity feed", category: "Bug", status: "In progress", statusAccent: "bg-warning" },
  { title: "Dark mode for the portal", category: "Feature request", status: "Planned", statusAccent: "bg-sky" },
];

const SAMPLE_CATEGORIES = [
  { label: "Feature requests", pct: 46 },
  { label: "Bugs", pct: 29 },
  { label: "Improvements", pct: 25 },
];

export function HeroPreview() {
  return (
    <div className="relative" aria-hidden="true">
      <div className="pointer-events-none absolute -inset-6 -z-10 rounded-[2rem] bg-gradient-to-br from-primary/25 via-sky/15 to-accent/25 opacity-70 blur-2xl" />

      <div className="rounded-3xl border border-border/70 bg-card/90 p-2 shadow-[0_24px_60px_-24px_hsl(var(--shadow-color)/0.35)] ring-1 ring-foreground/5 backdrop-blur-sm sm:p-3">
        <div className="rounded-2xl border border-border/60 bg-background/60 p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="flex size-2.5 rounded-full bg-destructive/60" />
              <span className="flex size-2.5 rounded-full bg-warning/60" />
              <span className="flex size-2.5 rounded-full bg-success/60" />
            </div>
            <span className="rounded-full border border-border/60 bg-muted/60 px-2.5 py-0.5 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
              Sample preview
            </span>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 p-3 ring-1 ring-primary/15">
              <div className="flex items-center justify-between">
                <span className="flex size-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
                  <MessageSquareText className="size-4" />
                </span>
                <span className="flex items-center gap-0.5 text-xs font-medium text-success">
                  <TrendingUp className="size-3" />
                  +18%
                </span>
              </div>
              <p className="mt-3 text-2xl font-semibold tracking-tight text-foreground">128</p>
              <p className="text-xs text-muted-foreground">Submissions this month</p>
            </div>

            <div className="rounded-xl bg-gradient-to-br from-sky/20 to-sky/5 p-3 ring-1 ring-sky/20">
              <p className="text-xs font-medium text-muted-foreground">By category</p>
              <div className="mt-3 space-y-2">
                {SAMPLE_CATEGORIES.map((c) => (
                  <div key={c.label}>
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>{c.label}</span>
                      <span className="tabular-nums">{c.pct}%</span>
                    </div>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-foreground/10">
                      <div className="h-full rounded-full bg-sky" style={{ width: `${c.pct}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-3 space-y-2">
            {SAMPLE_SUBMISSIONS.map((s) => (
              <div
                key={s.title}
                className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-card px-3.5 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{s.title}</p>
                  <p className="text-xs text-muted-foreground">{s.category}</p>
                </div>
                <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-border/60 bg-muted/60 px-2 py-0.5 text-[11px] font-medium text-foreground">
                  <span className={`size-1.5 rounded-full ${s.statusAccent}`} />
                  {s.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="absolute -right-4 -bottom-5 hidden rounded-2xl border border-border/70 bg-card px-4 py-3 shadow-[0_16px_40px_-16px_hsl(var(--shadow-color)/0.35)] ring-1 ring-foreground/5 sm:flex sm:items-center sm:gap-2.5">
        <span className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-accent to-accent/60 text-accent-foreground">
          <ArrowUpRight className="size-4" />
        </span>
        <div>
          <p className="text-sm font-semibold text-foreground">Customer insight</p>
          <p className="text-xs text-muted-foreground">Top request surfaced</p>
        </div>
      </div>
    </div>
  );
}

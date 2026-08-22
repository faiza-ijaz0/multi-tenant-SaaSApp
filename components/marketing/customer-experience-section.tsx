import { CheckCircle2 } from "lucide-react";

const CUSTOMER_CAPABILITIES = [
  "Submit feedback directly through their organization's portal",
  "Track their own submissions from a single account",
  "View current status on every idea and issue they've raised",
  "Follow product improvements as they move from planned to shipped",
  "Keep their full feedback history in one place, always accessible",
];

const TIMELINE = [
  { label: "Submitted", accent: "bg-muted-foreground/40", done: true },
  { label: "In review", accent: "bg-info", done: true },
  { label: "Planned", accent: "bg-sky", done: true },
  { label: "Shipped", accent: "bg-success", done: false },
];

export function CustomerExperienceSection() {
  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
      <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2 lg:gap-16">
        <div>
          <p className="text-xs font-semibold tracking-wide text-primary uppercase">Customer Portal</p>
          <h2 className="mt-3 font-heading text-3xl font-semibold tracking-tight text-balance text-foreground sm:text-4xl">
            Built for the people giving you feedback, too.
          </h2>
          <p className="mt-4 max-w-md text-base text-muted-foreground">
            A dedicated customer account keeps every idea, request, and update in one place -- so customers never
            have to wonder if their feedback went anywhere.
          </p>

          <ul className="mt-8 space-y-4">
            {CUSTOMER_CAPABILITIES.map((item) => (
              <li key={item} className="flex items-start gap-3">
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-success/15 text-success">
                  <CheckCircle2 className="size-3.5" aria-hidden="true" />
                </span>
                <span className="text-sm text-foreground">{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="relative" aria-hidden="true">
          <div className="pointer-events-none absolute -inset-4 -z-10 rounded-[2rem] bg-gradient-to-br from-sky/15 via-primary/10 to-transparent opacity-70 blur-2xl" />
          <div className="rounded-2xl border border-border/70 bg-card p-6 shadow-[0_20px_50px_-20px_hsl(var(--shadow-color)/0.3)] ring-1 ring-foreground/5">
            <p className="text-xs font-medium text-muted-foreground">Your submission</p>
            <p className="mt-1 font-heading text-lg font-semibold text-foreground">Bulk export for submissions</p>

            <div className="mt-6 space-y-0">
              {TIMELINE.map((step, i) => (
                <div key={step.label} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <span
                      className={`flex size-4 shrink-0 items-center justify-center rounded-full ${step.done ? step.accent : "bg-transparent ring-2 ring-border"}`}
                    />
                    {i < TIMELINE.length - 1 ? (
                      <span className={`w-px flex-1 ${step.done ? "bg-border" : "bg-border/50"}`} style={{ minHeight: "1.75rem" }} />
                    ) : null}
                  </div>
                  <p className={`pb-6 text-sm ${step.done ? "font-medium text-foreground" : "text-muted-foreground"}`}>
                    {step.label}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

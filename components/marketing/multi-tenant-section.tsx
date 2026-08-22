import { Building2, ShieldCheck } from "lucide-react";

const ORG_ROWS = ["Members", "Roles & Permissions", "Categories", "Statuses", "Feedback", "Customer Portal"];

const ORGS = ["Organization A", "Organization B", "Organization C"];

/**
 * Explains multi-tenancy at a product/marketing level -- deliberately no
 * mention of Supabase, RLS, database tables, or internal IDs (Phase 5
 * instruction: this is a marketing explanation, not a technical
 * architecture document). "Isolated workspace" is the entire claim; the
 * real enforcement lives in the app's authorization layer, not described
 * here.
 */
export function MultiTenantSection() {
  return (
    <section id="solutions" className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-xs font-semibold tracking-wide text-primary uppercase">Multi-tenant by design</p>
        <h2 className="mt-3 font-heading text-3xl font-semibold tracking-tight text-balance text-foreground sm:text-4xl">
          Every organization gets its own isolated workspace.
        </h2>
        <p className="mt-4 text-base text-muted-foreground">
          Organizations on SignalBoard operate completely independently -- their own team, their own
          feedback, their own customer portal.
        </p>
      </div>

      <div className="relative mt-16">
        <div className="mx-auto flex w-fit flex-col items-center">
          <span className="flex items-center gap-2 rounded-full border border-border/70 bg-card px-4 py-2 text-sm font-semibold text-foreground shadow-sm">
            <span className="flex size-6 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-sky text-[10px] font-bold text-primary-foreground">
              S
            </span>
            SignalBoard
          </span>
          <span aria-hidden="true" className="mt-2 h-8 w-px bg-gradient-to-b from-border to-transparent" />
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
          {ORGS.map((org, index) => {
            const accent = index === 0 ? "primary" : index === 1 ? "sky" : "accent";
            return (
              <div
                key={org}
                className="group relative overflow-hidden rounded-2xl border border-border/70 bg-card shadow-[0_1px_2px_hsl(var(--shadow-color)/0.06)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_16px_40px_-16px_hsl(var(--shadow-color)/0.3)]"
              >
                <div
                  className={`flex items-center gap-2 border-b border-border/60 px-4 py-3 ${
                    accent === "primary"
                      ? "bg-primary/8"
                      : accent === "sky"
                        ? "bg-sky/10"
                        : "bg-accent/50"
                  }`}
                >
                  <Building2
                    className={`size-4 ${accent === "primary" ? "text-primary" : accent === "sky" ? "text-sky" : "text-accent-foreground"}`}
                    aria-hidden="true"
                  />
                  <p className="text-sm font-semibold text-foreground">{org}</p>
                </div>
                <ul className="space-y-2 p-4">
                  {ORG_ROWS.map((row) => (
                    <li key={row} className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span aria-hidden="true" className="size-1 shrink-0 rounded-full bg-muted-foreground/50" />
                      {row}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mx-auto mt-10 flex max-w-xl items-start gap-3 rounded-2xl border border-border/70 bg-muted/30 p-5 text-left">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-success/20 to-success/5 text-success ring-1 ring-success/15">
          <ShieldCheck className="size-4.5" aria-hidden="true" />
        </span>
        <p className="text-sm text-muted-foreground">
          Each organization&apos;s members, feedback, and customers stay fully separate from every other
          organization on the platform -- no shared data, no cross-visibility.
        </p>
      </div>
    </section>
  );
}

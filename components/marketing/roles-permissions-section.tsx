import { Crown, ShieldCheck, UserRound } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface RoleCard {
  icon: LucideIcon;
  role: string;
  summary: string;
  capabilities: string[];
  accent: "primary" | "sky" | "accent";
}

// High-level only, and every line here traces directly to
// lib/authorization/registry.ts (PAGE_KEYS/ACTION_PERMISSIONS/ROLE_PRESETS)
// -- never a detailed permission matrix, and never a capability the app
// doesn't actually have.
const ROLES: RoleCard[] = [
  {
    icon: Crown,
    role: "Owner",
    summary: "Full control over the organization and its workspace.",
    capabilities: ["Organization ownership", "Manages organization settings", "Unrestricted workspace access"],
    accent: "primary",
  },
  {
    icon: ShieldCheck,
    role: "Admin",
    summary: "Operational management across the team and its feedback.",
    capabilities: [
      "Manages submissions, categories & statuses",
      "Manages team members and invitations",
      "Configures the customer portal",
    ],
    accent: "sky",
  },
  {
    icon: UserRound,
    role: "Member",
    summary: "Access to exactly the workspace areas assigned to them.",
    capabilities: ["Access set by assigned permissions", "Submits and comments on feedback", "Views categories & statuses"],
    accent: "accent",
  },
];

const ACCENT_CLASSNAMES: Record<RoleCard["accent"], string> = {
  primary: "bg-gradient-to-br from-primary/20 to-primary/5 text-primary ring-1 ring-primary/15",
  sky: "bg-gradient-to-br from-sky/25 to-sky/5 text-sky ring-1 ring-sky/20",
  accent: "bg-gradient-to-br from-accent to-accent/40 text-accent-foreground ring-1 ring-accent",
};

export function RolesPermissionsSection() {
  return (
    <section id="roles" className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-xs font-semibold tracking-wide text-primary uppercase">Roles &amp; permissions</p>
        <h2 className="mt-3 font-heading text-3xl font-semibold tracking-tight text-balance text-foreground sm:text-4xl">
          The right access for every teammate.
        </h2>
        <p className="mt-4 text-base text-muted-foreground">
          Delegate ownership without giving up control -- every role gets exactly the access it needs.
        </p>
      </div>

      <div className="mt-14 grid grid-cols-1 gap-5 md:grid-cols-3">
        {ROLES.map((role) => {
          const Icon = role.icon;
          return (
            <div
              key={role.role}
              className="group relative overflow-hidden rounded-2xl border border-border/70 bg-card p-6 shadow-[0_1px_2px_hsl(var(--shadow-color)/0.06)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_16px_40px_-16px_hsl(var(--shadow-color)/0.3)]"
            >
              <span className={`flex size-11 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-110 ${ACCENT_CLASSNAMES[role.accent]}`}>
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <h3 className="mt-4 font-heading text-lg font-semibold text-foreground">{role.role}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{role.summary}</p>
              <ul className="mt-4 space-y-2 border-t border-border/60 pt-4">
                {role.capabilities.map((capability) => (
                  <li key={capability} className="flex items-start gap-2 text-xs text-muted-foreground">
                    <span aria-hidden="true" className="mt-1.5 size-1 shrink-0 rounded-full bg-muted-foreground/50" />
                    {capability}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}

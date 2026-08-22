import {
  Activity,
  KeyRound,
  LayoutGrid,
  MessageSquareHeart,
  Palette,
  Settings2,
  Tags,
  Target,
  UsersRound,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface Capability {
  icon: LucideIcon;
  title: string;
  description: string;
}

// Every card maps to a real, existing dashboard/portal capability (see
// lib/authorization/registry.ts's PAGE_KEYS and the features it gates) --
// no invented functionality.
const CAPABILITIES: Capability[] = [
  {
    icon: MessageSquareHeart,
    title: "Feedback Management",
    description: "Collect, review, and act on every submission your customers send in.",
  },
  {
    icon: LayoutGrid,
    title: "Customer Portal",
    description: "A dedicated, brandable portal where customers submit and track their own feedback.",
  },
  {
    icon: Tags,
    title: "Categories",
    description: "Organize incoming feedback into categories that match how your team plans work.",
  },
  {
    icon: Target,
    title: "Statuses",
    description: "Track every submission through a workflow your organization defines.",
  },
  {
    icon: UsersRound,
    title: "Team Management",
    description: "Invite teammates and manage who belongs to your organization.",
  },
  {
    icon: KeyRound,
    title: "Roles & Permissions",
    description: "Give each teammate exactly the access their role requires -- nothing more.",
  },
  {
    icon: Settings2,
    title: "Organization Management",
    description: "Manage your organization's settings and workspace configuration in one place.",
  },
  {
    icon: Activity,
    title: "Activity & Analytics",
    description: "Understand feedback trends, category breakdowns, and team activity over time.",
  },
  {
    icon: Palette,
    title: "Portal Branding",
    description: "Customize your portal's name, welcome message, logo, and accent color.",
  },
];

export function ProductCapabilitiesSection() {
  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-xs font-semibold tracking-wide text-primary uppercase">Product capabilities</p>
        <h2 className="mt-3 font-heading text-3xl font-semibold tracking-tight text-balance text-foreground sm:text-4xl">
          Everything your workspace needs.
        </h2>
      </div>

      <div className="mt-14 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {CAPABILITIES.map((capability) => {
          const Icon = capability.icon;
          return (
            <div
              key={capability.title}
              className="group relative overflow-hidden rounded-2xl border border-border/70 bg-card p-6 shadow-[0_1px_2px_hsl(var(--shadow-color)/0.06)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_16px_40px_-16px_hsl(var(--shadow-color)/0.3)]"
            >
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -top-8 -right-8 size-24 rounded-full bg-primary/8 opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-100"
              />
              <span className="relative flex size-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 text-primary ring-1 ring-primary/15 transition-transform duration-300 group-hover:scale-110">
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <h3 className="relative mt-4 font-heading text-base font-semibold text-foreground">{capability.title}</h3>
              <p className="relative mt-1.5 text-sm leading-relaxed text-muted-foreground">{capability.description}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

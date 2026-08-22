import { Crown, ShieldCheck, UserRound } from "lucide-react";

import { cn } from "@/lib/utils";
import type { OrganizationRole } from "@/lib/auth/types";

/**
 * Shared role visual language -- originally defined in
 * features/members/member-management.tsx (Role Management), extracted here
 * so the Organization Settings member list (features/organizations) renders
 * the exact same badge for the exact same role rather than a drifting
 * near-duplicate. Not a behavior change for Role Management: same classes,
 * same icons, same labels, just imported instead of defined inline.
 */
export const ROLE_META: Record<
  OrganizationRole,
  { label: string; icon: typeof Crown; badgeClassName: string; ringClassName: string; avatarClassName: string }
> = {
  owner: {
    label: "Owner",
    icon: Crown,
    badgeClassName:
      "border-transparent bg-gradient-to-r from-primary to-primary/70 text-primary-foreground shadow-[0_1px_3px_hsl(var(--shadow-color)/0.25)]",
    ringClassName: "ring-2 ring-primary/50 dark:shadow-[0_0_18px_-6px_var(--primary)]",
    avatarClassName: "bg-gradient-to-br from-primary/25 to-accent/50 text-primary",
  },
  admin: {
    label: "Admin",
    icon: ShieldCheck,
    badgeClassName: "border-primary/25 bg-primary/10 text-primary",
    ringClassName: "ring-1 ring-primary/25",
    avatarClassName: "bg-secondary text-secondary-foreground",
  },
  member: {
    label: "Member",
    icon: UserRound,
    badgeClassName: "border-border bg-muted text-foreground",
    ringClassName: "ring-1 ring-border",
    avatarClassName: "bg-muted text-foreground",
  },
};

export function RoleBadge({ role }: { role: OrganizationRole }) {
  const meta = ROLE_META[role];
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
        meta.badgeClassName,
      )}
    >
      <Icon className="size-3" aria-hidden="true" />
      {meta.label}
    </span>
  );
}

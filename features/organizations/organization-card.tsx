import { Building2, Pencil } from "lucide-react";
import Link from "next/link";

import { RoleBadge } from "@/components/domain/role-badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { OrganizationRole } from "@/lib/auth/types";
import { formatDate } from "@/lib/format";

import { DeleteOrganizationButton } from "./delete-organization-button";
import { ViewOrganizationDialog } from "./view-organization-dialog";

/**
 * The premium organization summary card at the top of the Organization
 * Settings page (section 3). Edit is a real navigation, not a dialog or an
 * in-page form anymore: it sends the user to /dashboard/settings/portal,
 * the existing dedicated Portal Settings page, instead of opening the old
 * inline organization-name edit form that used to live further down this
 * page (removed -- see this feature's now-deleted organization-profile-form.tsx).
 */
export function OrganizationCard({
  organizationName,
  portalSlug,
  memberCount,
  currentRole,
  createdAt,
  canEdit,
  canDelete,
}: {
  organizationName: string;
  portalSlug: string | null;
  memberCount: number;
  currentRole: OrganizationRole;
  createdAt: string;
  canEdit: boolean;
  canDelete: boolean;
}) {
  return (
    <div className="rounded-2xl border border-border/70 bg-card p-5 shadow-[0_1px_2px_hsl(var(--shadow-color)/0.06)] sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-4">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/15 to-accent/40 text-primary">
            <Building2 className="size-6" aria-hidden="true" />
          </span>
          <div className="min-w-0 space-y-1.5">
            <h2 className="truncate text-lg font-semibold tracking-tight text-foreground">{organizationName}</h2>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <RoleBadge role={currentRole} />
              <span aria-hidden="true">·</span>
              <span>
                {memberCount} {memberCount === 1 ? "member" : "members"}
              </span>
              <span aria-hidden="true">·</span>
              <span>Created {formatDate(createdAt)}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Portal:{" "}
              {portalSlug ? (
                <code className="rounded bg-muted px-1.5 py-0.5">/feedback/{portalSlug}</code>
              ) : (
                <span>Not configured yet</span>
              )}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <ViewOrganizationDialog
            organizationName={organizationName}
            portalSlug={portalSlug}
            memberCount={memberCount}
            currentRole={currentRole}
            createdAt={createdAt}
          />
          {canEdit ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button asChild variant="ghost" size="icon-sm" aria-label="Edit organization">
                  <Link href="/dashboard/settings/portal">
                    <Pencil className="size-4" aria-hidden="true" />
                  </Link>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Edit</TooltipContent>
            </Tooltip>
          ) : null}
          {canDelete ? <DeleteOrganizationButton organizationName={organizationName} variant="icon" /> : null}
        </div>
      </div>
    </div>
  );
}

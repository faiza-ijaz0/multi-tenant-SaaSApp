"use client";

import { useState, type ReactNode } from "react";
import { Eye } from "lucide-react";

import { RoleBadge } from "@/components/domain/role-badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { OrganizationRole } from "@/lib/auth/types";
import { formatDate } from "@/lib/format";

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-3 py-2 first:pt-0 last:pb-0">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="col-span-2 text-sm text-foreground">{children}</dd>
    </div>
  );
}

/** Read-only, per section 4's requirement -- no field here is ever editable from this dialog. */
export function ViewOrganizationDialog({
  organizationName,
  portalSlug,
  memberCount,
  currentRole,
  createdAt,
}: {
  organizationName: string;
  portalSlug: string | null;
  memberCount: number;
  currentRole: OrganizationRole;
  createdAt: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DialogTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`View ${organizationName}`}>
              <Eye className="size-4" aria-hidden="true" />
            </Button>
          </DialogTrigger>
        </TooltipTrigger>
        <TooltipContent>View</TooltipContent>
      </Tooltip>
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="shrink-0 gap-1 border-b border-border/70 px-5 py-4 pr-10">
          <DialogTitle>{organizationName}</DialogTitle>
        </DialogHeader>
        {open ? (
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            <dl className="divide-y divide-border">
              <DetailRow label="Name">{organizationName}</DetailRow>
              <DetailRow label="Portal slug">
                {portalSlug ? (
                  <code className="rounded bg-muted px-1.5 py-0.5 text-xs">/feedback/{portalSlug}</code>
                ) : (
                  <span className="text-muted-foreground">Not configured yet</span>
                )}
              </DetailRow>
              <DetailRow label="Members">
                {memberCount} {memberCount === 1 ? "member" : "members"}
              </DetailRow>
              <DetailRow label="Your role">
                <RoleBadge role={currentRole} />
              </DetailRow>
              <DetailRow label="Created">{formatDate(createdAt)}</DetailRow>
            </dl>
          </div>
        ) : null}
        <DialogFooter className="mx-0 mb-0 shrink-0 rounded-b-xl border-t border-border/70 bg-muted/40 px-5 py-4">
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Close
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

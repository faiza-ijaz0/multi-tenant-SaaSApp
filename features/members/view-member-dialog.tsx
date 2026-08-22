"use client";

import { useState, type ReactNode } from "react";
import { Eye } from "lucide-react";

import { Badge } from "@/components/ui/badge";
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
import { ACTION_LABELS, PAGE_LABELS } from "@/lib/authorization/registry";
import { formatDate } from "@/lib/format";
import type { MembershipPermissions } from "./permissions";
import type { OrganizationMemberWithContact } from "./queries";

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-3 py-2 first:pt-0 last:pb-0">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="col-span-2 text-sm text-foreground">{children}</dd>
    </div>
  );
}

interface GrantItem {
  /**
   * A stable, unique-per-list identifier -- NOT the display label. Multiple
   * distinct permission keys share the same label (e.g. "submissions:view",
   * "comments:view", and "categories:view" all display as "View"), so
   * keying by label alone collides the moment a member holds more than one
   * of them. Callers pass `${type}-${rawKey}` so pages and actions can
   * never collide with each other either, even though only one GrantList
   * is ever rendered per type today.
   */
  key: string;
  label: string;
}

function GrantList({ items }: { items: GrantItem[] }) {
  if (items.length === 0) {
    return <span className="text-muted-foreground">None assigned</span>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <Badge key={item.key} variant="outline" className="font-normal">
          {item.label}
        </Badge>
      ))}
    </div>
  );
}

function ViewMemberContent({
  member,
  organizationName,
  memberLabel,
  permissions,
}: {
  member: OrganizationMemberWithContact;
  organizationName: string;
  memberLabel: string;
  permissions: MembershipPermissions | undefined;
}) {
  const isOwner = member.role === "owner";
  const pageItems: GrantItem[] = isOwner
    ? []
    : (permissions?.pages ?? []).map((key) => ({ key: `page-${key}`, label: PAGE_LABELS[key] }));
  const actionItems: GrantItem[] = isOwner
    ? []
    : (permissions?.actions ?? []).map((key) => ({
        key: `action-${key}`,
        label: ACTION_LABELS[key.split(":")[1]] ?? key,
      }));

  return (
    <dl className="divide-y divide-border">
      <DetailRow label="Name">{memberLabel}</DetailRow>
      <DetailRow label="Email">{member.email ?? <span className="text-muted-foreground">Not available</span>}</DetailRow>
      <DetailRow label="Role">
        <Badge variant={member.role === "member" ? "secondary" : "default"}>{member.role}</Badge>
      </DetailRow>
      <DetailRow label="Organization">{organizationName}</DetailRow>
      <DetailRow label="Status">
        <Badge variant="outline" className="font-normal text-success">
          Active
        </Badge>
      </DetailRow>
      <DetailRow label="Assigned pages">
        {isOwner ? <span className="text-muted-foreground">Full access (Owner)</span> : <GrantList items={pageItems} />}
      </DetailRow>
      <DetailRow label="Assigned actions">
        {isOwner ? (
          <span className="text-muted-foreground">Full access (Owner)</span>
        ) : (
          <GrantList items={actionItems} />
        )}
      </DetailRow>
      <DetailRow label="Created">{formatDate(member.joinedAt)}</DetailRow>
      <DetailRow label="Updated">
        {member.updatedAt && member.updatedAt !== member.joinedAt ? (
          formatDate(member.updatedAt)
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </DetailRow>
    </dl>
  );
}

export function ViewMemberDialog({
  member,
  organizationName,
  memberLabel,
  permissions,
}: {
  member: OrganizationMemberWithContact;
  organizationName: string;
  memberLabel: string;
  permissions: MembershipPermissions | undefined;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DialogTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`View ${memberLabel}`}>
              <Eye className="size-4" aria-hidden="true" />
            </Button>
          </DialogTrigger>
        </TooltipTrigger>
        <TooltipContent>View</TooltipContent>
      </Tooltip>
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="shrink-0 gap-1 border-b border-border/70 px-5 py-4 pr-10">
          <DialogTitle>{memberLabel}</DialogTitle>
        </DialogHeader>
        {open ? (
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            <ViewMemberContent
              member={member}
              organizationName={organizationName}
              memberLabel={memberLabel}
              permissions={permissions}
            />
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

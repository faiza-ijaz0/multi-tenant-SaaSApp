import { Users } from "lucide-react";

import { RoleBadge, ROLE_META } from "@/components/domain/role-badge";
import { EmptyState } from "@/components/states/empty-state";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import type { OrganizationMemberWithContact } from "@/features/members/queries";

import { RemoveMemberButton } from "./remove-member-button";

/**
 * Member roster for the dedicated Organization Members page
 * (/dashboard/settings/organization/members) -- deliberately simpler than
 * Role Management's MemberManagement (no search, no role/permission
 * editing, no Change Password): this page exists purely to answer "who
 * belongs to this organization" and "remove their membership," not to
 * manage roles or grants. Role Management remains the one place those
 * actions live. Never shows a profileId/membershipId/UUID -- real name
 * falls back to email, never to a truncated id.
 */
export function memberDisplayName(member: OrganizationMemberWithContact): string {
  return member.fullName || member.email || (member.isCurrentUser ? "You" : "Member");
}

function OrganizationMemberRow({
  member,
  organizationName,
  canRemove,
}: {
  member: OrganizationMemberWithContact;
  organizationName: string;
  canRemove: boolean;
}) {
  const name = memberDisplayName(member);
  const meta = ROLE_META[member.role];

  return (
    <div className="group flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 bg-card px-3.5 py-3 shadow-[0_1px_2px_hsl(var(--shadow-color)/0.06)] transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-[0_8px_24px_-12px_hsl(var(--shadow-color)/0.3)]">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <Avatar className={cn("size-9 shrink-0 after:hidden transition-transform duration-200 group-hover:scale-105", meta.ringClassName)}>
          <AvatarFallback className={cn("text-xs font-semibold", meta.avatarClassName)}>
            {name.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-medium text-foreground">{name}</span>
            {member.isCurrentUser ? (
              <span className="inline-flex items-center rounded-full border border-border bg-muted/50 px-2 py-0.5 text-xs text-muted-foreground">
                You
              </span>
            ) : null}
            <RoleBadge role={member.role} />
          </div>
          {member.email ? (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{member.email}</p>
          ) : null}
          <p className="mt-0.5 text-xs text-muted-foreground">Joined {formatDate(member.joinedAt)}</p>
        </div>
      </div>
      {canRemove ? (
        <div className="shrink-0">
          <RemoveMemberButton
            membershipId={member.membershipId}
            memberName={name}
            organizationName={organizationName}
          />
        </div>
      ) : null}
    </div>
  );
}

export function OrganizationMembersList({
  members,
  organizationName,
  canRemove,
}: {
  members: OrganizationMemberWithContact[];
  organizationName: string;
  canRemove: boolean;
}) {
  return (
    <div className="rounded-2xl border border-border/70 bg-card p-5 shadow-[0_1px_2px_hsl(var(--shadow-color)/0.06)] sm:p-6">
      {members.length === 0 ? (
        <EmptyState icon={<Users className="size-5" aria-hidden="true" />} title="No members yet" />
      ) : (
        <div className="space-y-2">
          {members.map((member) => (
            <OrganizationMemberRow
              key={member.membershipId}
              member={member}
              organizationName={organizationName}
              canRemove={canRemove}
            />
          ))}
        </div>
      )}
    </div>
  );
}

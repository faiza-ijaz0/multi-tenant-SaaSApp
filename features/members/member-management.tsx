"use client";

import { useMemo, useState, useTransition } from "react";
import { Crown, LayoutGrid, ListChecks, Trash2, Users } from "lucide-react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/states/confirm-dialog";
import { EmptyState } from "@/components/states/empty-state";
import { RoleBadge, ROLE_META } from "@/components/domain/role-badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { OrganizationRole } from "@/lib/auth/types";
import { formatDate } from "@/lib/format";
import type { MembershipPermissions } from "@/features/members/permissions";

import { removeMember, transferOwnership } from "./actions";
import { ChangePasswordDialog } from "./change-password-dialog";
import { MemberEditDialog } from "./member-edit-dialog";
import { ViewMemberDialog } from "./view-member-dialog";
import type { OrganizationMemberWithContact } from "./queries";

function memberLabel(member: OrganizationMemberWithContact): string {
  if (member.isCurrentUser) return "You";
  return member.fullName || member.email || `Member ${member.profileId.slice(0, 8)}`;
}

/**
 * Owner-only, requires explicit confirmation because this is a
 * destructive/privilege-changing action: the acting owner immediately
 * becomes an admin (transfer_organization_ownership() demotes the caller
 * in the same atomic call that promotes the target -- see
 * 0004_membership_ownership_hardening.sql), and undoing it requires the
 * new owner to transfer it back themselves. Kept as its own control,
 * separate from the combined Edit dialog -- a distinct, higher-ceremony
 * operation, not a field on the Edit form.
 */
function TransferOwnershipButton({ member }: { member: OrganizationMemberWithContact }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const label = memberLabel(member);

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={isPending}
            aria-label={`Make ${label} the owner`}
            onClick={() => setConfirmOpen(true)}
          >
            <Crown className="size-4" aria-hidden="true" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Make owner</TooltipContent>
      </Tooltip>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Make ${label} the owner?`}
        description={`${label} will become the owner of this organization, and you will become an admin. This can only be undone by the new owner transferring it back.`}
        confirmLabel="Transfer ownership"
        destructive
        onConfirm={() =>
          startTransition(async () => {
            const result = await transferOwnership(member.membershipId);
            if (!result.ok) toast.error(result.message ?? "Something went wrong.");
          })
        }
      />
    </>
  );
}

function DeleteMemberButton({ member }: { member: OrganizationMemberWithContact }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const label = memberLabel(member);

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={isPending}
            aria-label={`Delete ${label}`}
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => setConfirmOpen(true)}
          >
            <Trash2 className="size-4" aria-hidden="true" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Delete</TooltipContent>
      </Tooltip>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Delete this account?`}
        description={`${label} (${member.email ?? "no email on file"}, ${member.role}) will lose access to this organization immediately.`}
        confirmLabel="Delete account"
        destructive
        onConfirm={() =>
          startTransition(async () => {
            const result = await removeMember(member.membershipId);
            if (!result.ok) toast.error(result.message ?? "Something went wrong.");
          })
        }
      />
    </>
  );
}

function PermissionStats({ permissions }: { permissions: MembershipPermissions | undefined }) {
  const pageCount = permissions?.pages.length ?? 0;
  const actionCount = permissions?.actions.length ?? 0;
  if (pageCount === 0 && actionCount === 0) {
    return (
      <span className="inline-flex items-center rounded-full border border-border bg-muted/50 px-2 py-0.5 text-xs font-normal text-muted-foreground">
        No access granted
      </span>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 px-2 py-0.5 text-xs text-muted-foreground">
        <LayoutGrid className="size-3" aria-hidden="true" />
        {pageCount} {pageCount === 1 ? "page" : "pages"}
      </span>
      <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 px-2 py-0.5 text-xs text-muted-foreground">
        <ListChecks className="size-3" aria-hidden="true" />
        {actionCount} {actionCount === 1 ? "action" : "actions"}
      </span>
    </div>
  );
}

function MemberRow({
  member,
  actorRole,
  organizationName,
  permissions,
  canRemoveMembers,
  canAssignRole,
  canManagePermissions,
}: {
  member: OrganizationMemberWithContact;
  actorRole: OrganizationRole;
  organizationName: string;
  permissions: MembershipPermissions | undefined;
  canRemoveMembers: boolean;
  canAssignRole: boolean;
  canManagePermissions: boolean;
}) {
  // View/Edit/Change Password/Delete are shown on every row, including the
  // caller's own and any owner's -- no row is a special read-only case in
  // the UI. Edit and Delete on your own row are still independently
  // rejected server-side with a clean message (update_member_profile's "use
  // your own account settings" check, removeMemberForOrganization's
  // self-guard) -- never rely on UI hiding as the actual authorization
  // boundary. Change Password is the one exception: changeMemberPassword now
  // treats self-targeting as a plain self-service password change (allowed
  // for anyone authenticated, independent of roles_permissions:assign_role),
  // so it's always shown on your own row even without that grant. "Make
  // owner" is excluded on your own row for a different reason: transferring
  // ownership to yourself is meaningless, not an authorization boundary.
  const showEdit = canAssignRole;
  const showChangePassword = canAssignRole || member.isCurrentUser;
  const showTransfer = !member.isCurrentUser && actorRole === "owner";
  const showDelete = canRemoveMembers;
  const label = memberLabel(member);
  const meta = ROLE_META[member.role];

  return (
    <div
      className={cn(
        "group flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border/70 bg-card px-4 py-3.5 shadow-[0_1px_2px_hsl(var(--shadow-color)/0.06)] transition-all",
        "hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-[0_8px_24px_-12px_hsl(var(--shadow-color)/0.35)]",
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <Avatar className={cn("size-10 shrink-0 after:hidden", meta.ringClassName)}>
          <AvatarFallback className={cn("text-xs font-semibold", meta.avatarClassName)}>
            {label.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-semibold text-foreground">{label}</span>
            {member.isCurrentUser ? (
              <span className="inline-flex items-center rounded-full border border-border bg-muted/50 px-2 py-0.5 text-xs text-muted-foreground">
                You
              </span>
            ) : null}
            <RoleBadge role={member.role} />
          </div>
          {member.email ? (
            <p className="truncate text-xs text-muted-foreground">{member.email}</p>
          ) : null}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Joined {formatDate(member.joinedAt)}</span>
            {member.role === "owner" ? (
              <span className="inline-flex items-center rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 text-xs text-primary">
                Full access
              </span>
            ) : (
              <PermissionStats permissions={permissions} />
            )}
          </div>
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-0.5">
        <ViewMemberDialog
          member={member}
          organizationName={organizationName}
          memberLabel={label}
          permissions={permissions}
        />
        {showEdit ? (
          <MemberEditDialog
            membershipId={member.membershipId}
            member={member}
            memberLabel={label}
            actorRole={actorRole}
            canManagePermissions={canManagePermissions}
            currentPages={permissions?.pages ?? []}
            currentActions={permissions?.actions ?? []}
          />
        ) : null}
        {showChangePassword ? (
          <ChangePasswordDialog membershipId={member.membershipId} memberLabel={label} memberEmail={member.email} />
        ) : null}
        {showTransfer ? <TransferOwnershipButton member={member} /> : null}
        {showDelete ? <DeleteMemberButton member={member} /> : null}
      </div>
    </div>
  );
}

export function MemberManagement({
  members,
  actorRole,
  organizationName,
  memberPermissions,
  canRemoveMembers,
  canAssignRole,
  canManagePermissions,
}: {
  members: OrganizationMemberWithContact[];
  actorRole: OrganizationRole;
  organizationName: string;
  memberPermissions: Record<string, MembershipPermissions>;
  canRemoveMembers: boolean;
  canAssignRole: boolean;
  canManagePermissions: boolean;
}) {
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<OrganizationRole | "">("");

  // Purely client-side, over data already fetched through the tenant-scoped
  // RLS-safe query above -- there is no new query path here for search/
  // filter to bypass tenant isolation through.
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return members.filter((member) => {
      if (roleFilter && member.role !== roleFilter) return false;
      if (!query) return true;
      return memberLabel(member).toLowerCase().includes(query);
    });
  }, [members, search, roleFilter]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-border/70 bg-gradient-to-br from-card to-muted/30 p-4 shadow-[0_1px_2px_hsl(var(--shadow-color)/0.06)]">
        <div className="flex min-w-40 flex-1 flex-col gap-1">
          <Label htmlFor="member-search" className="text-xs text-muted-foreground">
            Search
          </Label>
          <Input
            id="member-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search members…"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="member-role-filter" className="text-xs text-muted-foreground">
            Role
          </Label>
          <NativeSelect
            id="member-role-filter"
            value={roleFilter}
            onChange={(event) => setRoleFilter(event.target.value as OrganizationRole | "")}
          >
            <option value="">All roles</option>
            <option value="owner">Owner</option>
            <option value="admin">Admin</option>
            <option value="member">Member</option>
          </NativeSelect>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Users className="size-5" aria-hidden="true" />}
          title={members.length === 0 ? "No members yet" : "No members match your search"}
          description={
            members.length === 0
              ? "Add your first team member to start managing roles and permissions."
              : "Try a different search term or clear the role filter."
          }
        />
      ) : (
        <div className="space-y-2.5">
          {filtered.map((member) => (
            <MemberRow
              key={member.membershipId}
              member={member}
              actorRole={actorRole}
              organizationName={organizationName}
              permissions={memberPermissions[member.membershipId]}
              canRemoveMembers={canRemoveMembers}
              canAssignRole={canAssignRole}
              canManagePermissions={canManagePermissions}
            />
          ))}
        </div>
      )}
    </div>
  );
}

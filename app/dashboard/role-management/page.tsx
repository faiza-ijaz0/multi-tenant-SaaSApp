import { Building2, Crown, ShieldCheck, UserPlus, UserRound, Users } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { CreateMemberDialog } from "@/features/members/create-member-dialog";
import { MemberManagement } from "@/features/members/member-management";
import { listMembershipPermissions, type MembershipPermissions } from "@/features/members/permissions";
import { enrichMembersWithContactInfo } from "@/features/members/queries";

import { StatCard } from "@/components/analytics/stat-card";
import { EmptyState } from "@/components/states/empty-state";
import { ErrorState } from "@/components/states/error-state";
import { PageHeader } from "@/components/states/page-header";
import { Button } from "@/components/ui/button";
import { computeMemberStats } from "@/lib/analytics/member-stats";
import { getTenantScope } from "@/lib/auth/context";
import { getEffectivePermissions, hasAction, hasPage } from "@/lib/authorization/permissions";
import {
  OrganizationAccessDeniedError,
  OrganizationNotFoundError,
  UnauthenticatedError,
} from "@/lib/auth/errors";
import { getOrganizationMembers, MemberRosterTooLargeError } from "@/lib/auth/organization-details";

export default async function RoleManagementPage() {
  let scope;
  try {
    scope = await getTenantScope();
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      redirect("/login?next=/dashboard/role-management");
    }
    if (!(error instanceof OrganizationNotFoundError) && !(error instanceof OrganizationAccessDeniedError)) {
      throw error;
    }
    return (
      <div className="space-y-6">
        <PageHeader title="Role Management" />
        <EmptyState
          icon={<Building2 className="size-5" aria-hidden="true" />}
          title="No organization yet"
          description="Create an organization to manage its members."
          action={
            <Button asChild size="sm">
              <Link href="/onboarding">Create an organization</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const { supabase, user, organization, membership } = scope;
  const permissions = await getEffectivePermissions(scope);
  if (!hasPage(permissions, "members")) {
    notFound();
  }

  const canRemoveMembers = hasAction(permissions, "members:delete");
  const canAssignRole = hasAction(permissions, "roles_permissions:assign_role");
  const canManagePermissions = hasAction(permissions, "roles_permissions:manage_permissions");
  // Gates the Add Member CTA -- deliberately members:invite (the permission
  // create-account.ts's createMemberAccount actually requires), not
  // invitations:create. Role Management no longer has an invitation
  // workflow at all (see MemberManagement), so the two must not be
  // conflated the way this page did before.
  const canCreateMember = hasAction(permissions, "members:invite");

  const membersResult = await getOrganizationMembers(supabase, organization.id, user.id).then(
    (members) => ({ ok: true as const, members }),
    (error: unknown) => {
      if (error instanceof MemberRosterTooLargeError) {
        return { ok: false as const, message: error.message };
      }
      throw error;
    },
  );

  if (!membersResult.ok) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Management"
          title="Role Management"
          description={`Manage people, roles, permissions, and access for ${organization.name}.`}
        />
        <ErrorState title="Too many members to display" description={membersResult.message} />
      </div>
    );
  }
  const { members: rawMembers } = membersResult;

  const [members, permissionsByMembershipId] = await Promise.all([
    enrichMembersWithContactInfo(supabase, organization.id, rawMembers),
    listMembershipPermissions(
      supabase,
      rawMembers.filter((member) => member.role !== "owner").map((member) => member.membershipId),
    ),
  ]);
  const memberPermissions: Record<string, MembershipPermissions> = Object.fromEntries(
    permissionsByMembershipId,
  );

  // Real counts derived from the roster already fetched above -- no extra
  // queries, and never fabricated.
  const memberStats = computeMemberStats(members);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Management"
        title="Role Management"
        description="Manage people, roles, permissions, and access for this organization."
        actions={canCreateMember ? <CreateMemberDialog actorRole={membership.role} /> : null}
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <StatCard label="Total members" value={memberStats.total} icon={<Users className="size-5" aria-hidden="true" />} />
        <StatCard label="Owners" value={memberStats.owners} icon={<Crown className="size-5" aria-hidden="true" />} accent="warning" />
        <StatCard label="Admins" value={memberStats.admins} icon={<ShieldCheck className="size-5" aria-hidden="true" />} accent="info" />
        <StatCard label="Members" value={memberStats.members} icon={<UserRound className="size-5" aria-hidden="true" />} />
        <StatCard label="Recently added" value={memberStats.recentlyAdded} icon={<UserPlus className="size-5" aria-hidden="true" />} accent="success" meta="Last 7 days" />
      </div>

      <MemberManagement
        members={members}
        actorRole={membership.role}
        organizationName={organization.name}
        memberPermissions={memberPermissions}
        canRemoveMembers={canRemoveMembers}
        canAssignRole={canAssignRole}
        canManagePermissions={canManagePermissions}
      />
    </div>
  );
}

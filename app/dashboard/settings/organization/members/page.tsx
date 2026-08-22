import { Building2, Crown, ShieldCheck, UserPlus, UserRound, Users } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { OrganizationMembersList } from "@/features/organizations/organization-members-list";
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

/**
 * "Which people belong to this organization?" and "remove this person's
 * membership" -- deliberately not role/permission management (that stays
 * on /dashboard/role-management). Gated by its own `organization_members`
 * page permission (Phase 17, supabase/migrations/0015_organization_members_page.sql)
 * -- deliberately independent of `settings`/Organization Settings, so the
 * two can be delegated separately rather than always bundled together.
 */
export default async function OrganizationMembersPage() {
  let scope;
  try {
    scope = await getTenantScope();
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      redirect("/login?next=/dashboard/settings/organization/members");
    }
    if (!(error instanceof OrganizationNotFoundError) && !(error instanceof OrganizationAccessDeniedError)) {
      throw error;
    }
    return (
      <div className="space-y-6">
        <PageHeader title="Organization Members" />
        <EmptyState
          icon={<Building2 className="size-5" aria-hidden="true" />}
          title="No organization yet"
          description="Create an organization to see its members here."
          action={
            <Button asChild size="sm">
              <Link href="/onboarding">Create an organization</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const { supabase, user, organization } = scope;
  const permissions = await getEffectivePermissions(scope);
  if (!hasPage(permissions, "organization_members")) {
    notFound();
  }

  const canRemove = hasAction(permissions, "members:delete");

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
          eyebrow="Settings"
          title="Organization Members"
          description={`People who have access to ${organization.name}.`}
        />
        <ErrorState title="Too many members to display" description={membersResult.message} />
      </div>
    );
  }

  const members = await enrichMembersWithContactInfo(supabase, organization.id, membersResult.members);
  const memberStats = computeMemberStats(members);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Settings"
        title="Organization Members"
        description={`People who have access to ${organization.name}.`}
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <StatCard label="Total members" value={memberStats.total} icon={<Users className="size-5" aria-hidden="true" />} />
        <StatCard label="Owners" value={memberStats.owners} icon={<Crown className="size-5" aria-hidden="true" />} accent="warning" />
        <StatCard label="Admins" value={memberStats.admins} icon={<ShieldCheck className="size-5" aria-hidden="true" />} accent="info" />
        <StatCard label="Members" value={memberStats.members} icon={<UserRound className="size-5" aria-hidden="true" />} />
        <StatCard label="Recently joined" value={memberStats.recentlyAdded} icon={<UserPlus className="size-5" aria-hidden="true" />} accent="success" meta="Last 7 days" />
      </div>

      <OrganizationMembersList members={members} organizationName={organization.name} canRemove={canRemove} />
    </div>
  );
}

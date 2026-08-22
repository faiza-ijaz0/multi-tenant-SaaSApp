import { Building2 } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { DeleteOrganizationButton } from "@/features/organizations/delete-organization-button";
import { OrganizationCard } from "@/features/organizations/organization-card";
import { getOrganizationCreatedAt } from "@/features/organizations/queries";

import { EmptyState } from "@/components/states/empty-state";
import { ErrorState } from "@/components/states/error-state";
import { PageHeader } from "@/components/states/page-header";
import { Button } from "@/components/ui/button";
import { getTenantScope } from "@/lib/auth/context";
import { getEffectivePermissions, hasAction, hasPage } from "@/lib/authorization/permissions";
import {
  OrganizationAccessDeniedError,
  OrganizationNotFoundError,
  UnauthenticatedError,
} from "@/lib/auth/errors";
import { getOrganizationMembers, getOrganizationPortalSlug, MemberRosterTooLargeError } from "@/lib/auth/organization-details";

export default async function OrganizationSettingsPage() {
  let scope;
  try {
    scope = await getTenantScope();
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      redirect("/login?next=/dashboard/settings/organization");
    }
    if (!(error instanceof OrganizationNotFoundError) && !(error instanceof OrganizationAccessDeniedError)) {
      throw error;
    }
    return (
      <div className="space-y-6">
        <PageHeader title="Organization Settings" />
        <EmptyState
          icon={<Building2 className="size-5" aria-hidden="true" />}
          title="No organization yet"
          description="Create an organization to manage its settings."
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
  if (!hasPage(permissions, "settings")) {
    notFound();
  }

  // Edit now navigates straight to the dedicated Portal Settings page
  // (/dashboard/settings/portal), so the Edit icon's visibility reflects
  // access to *that* page/action -- not organization_settings:edit, which
  // no longer has a UI surface on this page now that the inline
  // organization-name form is gone (see organization-card.tsx's doc
  // comment). Showing Edit only when the destination is actually reachable
  // avoids sending someone to a page that immediately 404s them.
  const canEditOrganization = hasPage(permissions, "portal_settings") && hasAction(permissions, "portal_settings:edit");
  // Organization deletion is never a delegable action permission (see
  // lib/authorization/registry.ts's own comment on why) -- it's a hardcoded
  // owner-only UI gate, matching organizations_delete_owner's own
  // is_organization_owner(id) check and deleteOrganization()'s app-level
  // pre-check (features/organizations/actions.ts).
  const canDeleteOrganization = membership.role === "owner";

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
          title="Organization Settings"
          description="Manage your organization profile and access."
        />
        <ErrorState title="Too many members to display" description={membersResult.message} />
      </div>
    );
  }

  const [portalSlug, createdAt] = await Promise.all([
    getOrganizationPortalSlug(supabase, organization.id),
    getOrganizationCreatedAt(supabase, organization.id),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Settings"
        title="Organization Settings"
        description="Manage your organization profile and access."
      />

      <OrganizationCard
        organizationName={organization.name}
        portalSlug={portalSlug}
        memberCount={membersResult.members.length}
        currentRole={membership.role}
        createdAt={createdAt}
        canEdit={canEditOrganization}
        canDelete={canDeleteOrganization}
      />

      {canDeleteOrganization ? (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/[0.03] p-5 shadow-[0_1px_2px_hsl(var(--shadow-color)/0.06)] sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <h2 className="text-base font-semibold text-destructive">Danger Zone</h2>
              <p className="text-sm text-muted-foreground">
                Permanently remove this organization and its associated organization data.
              </p>
            </div>
            <DeleteOrganizationButton organizationName={organization.name} variant="full" />
          </div>
        </div>
      ) : null}
    </div>
  );
}

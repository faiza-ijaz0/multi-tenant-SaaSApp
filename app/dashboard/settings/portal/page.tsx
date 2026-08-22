import { Building2 } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { PortalSettingsForm } from "@/features/portal-settings/portal-settings-form";
import { getPortalSettings } from "@/features/portal-settings/queries";

import { EmptyState } from "@/components/states/empty-state";
import { PageHeader } from "@/components/states/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getTenantScope } from "@/lib/auth/context";
import { getEffectivePermissions, hasAction, hasPage } from "@/lib/authorization/permissions";
import {
  OrganizationAccessDeniedError,
  OrganizationNotFoundError,
  UnauthenticatedError,
} from "@/lib/auth/errors";

export default async function PortalSettingsPage() {
  let scope;
  try {
    scope = await getTenantScope();
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      redirect("/login?next=/dashboard/settings/portal");
    }
    if (!(error instanceof OrganizationNotFoundError) && !(error instanceof OrganizationAccessDeniedError)) {
      throw error;
    }
    return (
      <div className="space-y-6">
        <PageHeader title="Public portal" />
        <EmptyState
          icon={<Building2 className="size-5" aria-hidden="true" />}
          title="No organization yet"
          description="Create an organization to configure your public portal."
          action={
            <Button asChild size="sm">
              <Link href="/onboarding">Create an organization</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const permissions = await getEffectivePermissions(scope);
  if (!hasPage(permissions, "portal_settings")) {
    notFound();
  }

  const settings = await getPortalSettings(scope.supabase, scope.organization.id);
  const canManage = hasAction(permissions, "portal_settings:edit");

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Settings"
        title="Public portal"
        description="Configure the public feedback portal customers see at /feedback/[slug]."
      />
      <Card>
        <CardContent>
          <PortalSettingsForm settings={settings} canManage={canManage} />
        </CardContent>
      </Card>
    </div>
  );
}

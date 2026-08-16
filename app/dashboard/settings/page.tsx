import { Building2 } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { EmptyState } from "@/components/states/empty-state";
import { PageHeader } from "@/components/states/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getTenantScope, type TenantScope } from "@/lib/auth/context";
import {
  OrganizationAccessDeniedError,
  OrganizationNotFoundError,
  UnauthenticatedError,
} from "@/lib/auth/errors";
import {
  getOrganizationMembers,
  getOrganizationPortalSlug,
} from "@/lib/auth/organization-details";

async function resolveSettingsScope(): Promise<TenantScope | null> {
  try {
    return await getTenantScope();
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      redirect("/login?next=/dashboard/settings");
    }
    if (error instanceof OrganizationNotFoundError || error instanceof OrganizationAccessDeniedError) {
      return null;
    }
    throw error;
  }
}

export default async function OrganizationSettingsPage() {
  const scope = await resolveSettingsScope();

  if (!scope) {
    return (
      <div className="space-y-6">
        <PageHeader title="Settings" />
        <EmptyState
          icon={<Building2 className="size-5" aria-hidden="true" />}
          title="No organization yet"
          description="Create an organization to see its settings here."
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
  const [members, portalSlug] = await Promise.all([
    getOrganizationMembers(supabase, organization.id, user.id),
    getOrganizationPortalSlug(supabase, organization.id),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Organization details and team members." />

      <Card>
        <CardHeader>
          <CardTitle>{organization.name}</CardTitle>
          <CardDescription>
            {portalSlug ? `Public portal: /feedback/${portalSlug}` : "Public portal not set up yet"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Your role: <Badge variant={membership.role === "member" ? "secondary" : "default"}>{membership.role}</Badge>
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
          <CardDescription>{members.length} {members.length === 1 ? "member" : "members"}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {members.map((member) => (
            <div
              key={member.membershipId}
              className="flex items-center justify-between rounded-lg border border-border px-3 py-2"
            >
              <span className="text-sm text-foreground">
                {member.isCurrentUser ? "You" : `Member ${member.profileId.slice(0, 8)}`}
              </span>
              <Badge variant={member.role === "member" ? "secondary" : "default"}>
                {member.role}
              </Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

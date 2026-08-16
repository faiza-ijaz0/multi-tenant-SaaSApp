import { Building2, Inbox } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { EmptyState } from "@/components/states/empty-state";
import { PageHeader } from "@/components/states/page-header";
import { Button } from "@/components/ui/button";
import { getCurrentOrganizationContext } from "@/lib/auth/context";
import {
  OrganizationAccessDeniedError,
  OrganizationNotFoundError,
  UnauthenticatedError,
} from "@/lib/auth/errors";

type DashboardView =
  | { kind: "ready"; organizationName: string }
  | { kind: "no-organization" };

async function resolveDashboardView(): Promise<DashboardView> {
  try {
    const context = await getCurrentOrganizationContext();
    return { kind: "ready", organizationName: context.organization.name };
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      // The proxy already redirects unauthenticated requests to /dashboard/*
      // away from here (optimistic, cookie-only check); this is the real,
      // server-verified check for whoever still reaches this render (e.g. a
      // token that expired between the proxy check and this request).
      redirect("/login?next=/dashboard");
    }
    if (
      error instanceof OrganizationNotFoundError ||
      error instanceof OrganizationAccessDeniedError
    ) {
      return { kind: "no-organization" };
    }
    // Unexpected failure (e.g. network/database error) -- let the existing
    // app/dashboard/error.tsx boundary handle it rather than masking it.
    throw error;
  }
}

export default async function DashboardPage() {
  const view = await resolveDashboardView();

  if (view.kind === "no-organization") {
    return (
      <div className="space-y-6">
        <PageHeader title="Submissions" />
        <EmptyState
          icon={<Building2 className="size-5" aria-hidden="true" />}
          title="No organization yet"
          description="You're not a member of an organization yet."
          action={
            <Button asChild size="sm">
              <Link href="/onboarding">Create an organization</Link>
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Submissions"
        description={`Feature requests and bug reports for ${view.organizationName}.`}
      />
      <EmptyState
        icon={<Inbox className="size-5" aria-hidden="true" />}
        title="Submissions foundation ready"
        description="Submission management lands in an upcoming development phase."
      />
    </div>
  );
}

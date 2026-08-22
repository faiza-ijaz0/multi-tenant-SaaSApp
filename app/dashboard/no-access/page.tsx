import { ShieldOff } from "lucide-react";
import { redirect } from "next/navigation";

import { EmptyState } from "@/components/states/empty-state";
import { PageHeader } from "@/components/states/page-header";
import { getTenantScope } from "@/lib/auth/context";
import {
  OrganizationAccessDeniedError,
  OrganizationNotFoundError,
  UnauthenticatedError,
} from "@/lib/auth/errors";

import { NoAccessSignOutButton } from "./sign-out-button";

/**
 * Landing page for an authenticated Admin/Member whose effective page
 * permissions (see lib/authorization/permissions.ts) grant access to
 * nothing at all -- resolvePostLoginRedirect (lib/auth/auth-actions.ts)
 * sends them here instead of /dashboard, which they can't open anyway.
 *
 * Deliberately requires NO page permission of its own (no hasPage()/
 * notFound() check) -- that's the entire point: an account with zero
 * grants must still be able to reach a page that explains why and offers a
 * way out, not bounce between /dashboard and a 404 forever.
 */
export default async function NoAccessPage() {
  let scope;
  try {
    scope = await getTenantScope();
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      redirect("/login?next=/dashboard/no-access");
    }
    if (error instanceof OrganizationNotFoundError) {
      redirect("/onboarding");
    }
    if (!(error instanceof OrganizationAccessDeniedError)) {
      throw error;
    }
    redirect("/login");
  }

  return (
    <div className="space-y-6">
      <PageHeader title="No access yet" />
      <EmptyState
        icon={<ShieldOff className="size-5" aria-hidden="true" />}
        title="No pages have been assigned to this account"
        description={`Your account has access to ${scope.organization.name}, but no dashboard pages have been assigned yet. Ask an organization owner or admin to grant you access from Role Management.`}
        action={<NoAccessSignOutButton />}
      />
    </div>
  );
}

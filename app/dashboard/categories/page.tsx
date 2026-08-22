import { Building2, FolderKanban, Sparkles } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { CategoryManager } from "@/features/categories/category-manager";
import { listCategories } from "@/features/categories/queries";
import { getCategoryStats } from "@/features/categories/stats";
import { getCategoryDistribution } from "@/features/submissions/queries";

import { StatCard } from "@/components/analytics/stat-card";
import { EmptyState } from "@/components/states/empty-state";
import { PageHeader } from "@/components/states/page-header";
import { Button } from "@/components/ui/button";
import { getTenantScope } from "@/lib/auth/context";
import { getEffectivePermissions, hasAction, hasPage } from "@/lib/authorization/permissions";
import {
  OrganizationAccessDeniedError,
  OrganizationNotFoundError,
  UnauthenticatedError,
} from "@/lib/auth/errors";

export default async function CategoriesPage() {
  let scope;
  try {
    scope = await getTenantScope();
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      redirect("/login?next=/dashboard/categories");
    }
    if (!(error instanceof OrganizationNotFoundError) && !(error instanceof OrganizationAccessDeniedError)) {
      throw error;
    }
    return (
      <div className="space-y-6">
        <PageHeader title="Categories" />
        <EmptyState
          icon={<Building2 className="size-5" aria-hidden="true" />}
          title="No organization yet"
          description="Create an organization to manage categories."
          action={
            <Button asChild size="sm">
              <Link href="/onboarding">Create an organization</Link>
            </Button>
          }
        />
      </div>
    );
  }

  // Route-level protection: a caller without the 'categories' page
  // permission gets the same not-found treatment as a nonexistent route --
  // no dead link, no "you don't have access" leak of the page's existence.
  const permissions = await getEffectivePermissions(scope);
  if (!hasPage(permissions, "categories")) {
    notFound();
  }

  const categories = await listCategories(scope.supabase, scope.organization.id);
  const [stats, distribution] = await Promise.all([
    getCategoryStats(scope.supabase, scope.organization.id),
    getCategoryDistribution(scope.supabase, scope.organization.id, categories),
  ]);
  const mostUsed = [...distribution].sort((a, b) => b.count - a.count).find((entry) => entry.count > 0);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Feedback"
        title="Categories"
        description="Organize submissions so customers and your team can browse feedback by topic."
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total categories" value={stats.total} icon={<FolderKanban className="size-5" aria-hidden="true" />} />
        <StatCard label="Created today" value={stats.today} icon={<FolderKanban className="size-5" aria-hidden="true" />} accent="info" />
        <StatCard label="This week" value={stats.newThisWeek} icon={<FolderKanban className="size-5" aria-hidden="true" />} accent="success" />
        <StatCard
          label="Most used"
          value={mostUsed?.count ?? 0}
          icon={<Sparkles className="size-5" aria-hidden="true" />}
          accent="warning"
          meta={mostUsed?.name}
        />
      </div>

      <CategoryManager
        categories={categories}
        permissions={{
          create: hasAction(permissions, "categories:create"),
          edit: hasAction(permissions, "categories:edit"),
          delete: hasAction(permissions, "categories:delete"),
        }}
      />
    </div>
  );
}

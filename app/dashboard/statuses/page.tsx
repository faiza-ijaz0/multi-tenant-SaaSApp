import { Building2, CircleDot } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { StatusManager } from "@/features/statuses/status-manager";
import { listStatuses } from "@/features/statuses/queries";
import { getStatusStats } from "@/features/statuses/stats";
import { getSubmissionStats } from "@/features/submissions/queries";

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

export default async function StatusesPage() {
  let scope;
  try {
    scope = await getTenantScope();
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      redirect("/login?next=/dashboard/statuses");
    }
    if (!(error instanceof OrganizationNotFoundError) && !(error instanceof OrganizationAccessDeniedError)) {
      throw error;
    }
    return (
      <div className="space-y-6">
        <PageHeader title="Statuses" />
        <EmptyState
          icon={<Building2 className="size-5" aria-hidden="true" />}
          title="No organization yet"
          description="Create an organization to manage statuses."
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
  if (!hasPage(permissions, "statuses")) {
    notFound();
  }

  const statuses = await listStatuses(scope.supabase, scope.organization.id);
  const [stats, submissionStats] = await Promise.all([
    getStatusStats(scope.supabase, scope.organization.id),
    getSubmissionStats(scope.supabase, scope.organization.id, statuses),
  ]);
  const mostUsed = [...submissionStats.byStatus].sort((a, b) => b.count - a.count).find((entry) => entry.count > 0);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Feedback"
        title="Statuses"
        description="Workflow states for submissions, from first triage to done."
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total statuses" value={stats.total} icon={<CircleDot className="size-5" aria-hidden="true" />} />
        <StatCard label="Created today" value={stats.today} icon={<CircleDot className="size-5" aria-hidden="true" />} accent="info" />
        <StatCard label="This week" value={stats.newThisWeek} icon={<CircleDot className="size-5" aria-hidden="true" />} accent="success" />
        <StatCard
          label="Most used"
          value={mostUsed?.count ?? 0}
          icon={<CircleDot className="size-5" aria-hidden="true" />}
          accent="warning"
          meta={mostUsed?.name}
        />
      </div>

      {submissionStats.byStatus.some((status) => status.count > 0) ? (
        <div className="rounded-2xl border border-border/70 bg-card p-5 shadow-[0_1px_2px_hsl(var(--shadow-color)/0.06)] sm:p-6">
          <p className="mb-3 text-sm font-semibold text-foreground">Submissions by status</p>
          <div className="space-y-2">
            {submissionStats.byStatus.map((status) => {
              const fraction = submissionStats.total > 0 ? status.count / submissionStats.total : 0;
              return (
                <div key={status.statusId} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5 font-medium text-foreground">
                      <span className="size-1.5 rounded-full" style={{ backgroundColor: status.color }} />
                      {status.name}
                    </span>
                    <span className="tabular-nums text-muted-foreground">{status.count}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{ width: `${Math.round(fraction * 100)}%`, backgroundColor: status.color }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      <StatusManager
        statuses={statuses}
        permissions={{
          create: hasAction(permissions, "statuses:create"),
          edit: hasAction(permissions, "statuses:edit"),
          delete: hasAction(permissions, "statuses:delete"),
        }}
      />
    </div>
  );
}

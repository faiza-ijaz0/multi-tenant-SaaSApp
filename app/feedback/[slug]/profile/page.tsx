import { ArrowBigUp, Building2, Calendar, CheckCircle2, CircleDot, ListChecks, Mail, MessageSquareDashed, UserRound } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { StatCard } from "@/components/analytics/stat-card";
import { EditProfileNameDialog } from "@/components/customer-portal/edit-profile-name-dialog";
import { EmptyState } from "@/components/states/empty-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { resolveCustomerIdentity } from "@/features/customers/customer-eligibility";
import { getCustomerMembership } from "@/features/customers/queries";
import { getPortalBySlug } from "@/features/portal-settings/queries";
import { getCustomerFeedbackStats, listSubmissions } from "@/features/submissions/queries";
import { formatDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

interface ProfilePageProps {
  params: Promise<{ slug: string }>;
}

const RECENT_FEEDBACK_LIMIT = 3;

/**
 * The customer's own profile, scoped to this one portal. Every field here
 * comes from a real, RLS-scoped read of this caller's own identity
 * (profiles_select_own, customers_select_self_or_admin) or their own
 * submissions (submissions_select_scoped + a submittedBy filter) -- no
 * other customer's data is ever queried, let alone shown. The only writable
 * field is full_name (EditProfileNameDialog -> updateCustomerFullName,
 * profiles_update_own) -- organization, role, membership, and ownership
 * aren't columns on profiles at all, so there's no action here that could
 * touch them even by mistake.
 */
export default async function CustomerProfilePage({ params }: ProfilePageProps) {
  const { slug } = await params;
  const supabase = await createClient();

  const portal = await getPortalBySlug(supabase, slug);
  if (!portal) notFound();

  // A *customer* identity for this org (Phase 4) -- see resolveCustomerIdentity's
  // own comment for why an internal owner/admin/member of this exact org
  // resolves to null here too.
  const user = await resolveCustomerIdentity(supabase, portal.organizationId);
  if (!user) {
    redirect(`/feedback/sign-in?next=/feedback/${slug}/profile`);
  }

  const [membership, stats, recentSubmissions] = await Promise.all([
    getCustomerMembership(supabase, portal.organizationId, user.id),
    getCustomerFeedbackStats(supabase, portal.organizationId, user.id, []),
    listSubmissions(supabase, portal.organizationId, { submittedBy: user.id, sort: "newest" }),
  ]);
  const recent = recentSubmissions.slice(0, RECENT_FEEDBACK_LIMIT);

  const displayName = user.fullName ?? user.email ?? "Your account";

  return (
    <div className="space-y-6">
      <div>
        <span className="flex size-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 text-primary ring-1 ring-primary/15">
          <UserRound className="size-5" aria-hidden="true" />
        </span>
        <h1 className="mt-4 font-heading text-2xl font-semibold tracking-tight text-foreground">Profile</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your account and activity in {portal.brandName ?? "this portal"}.
        </p>
      </div>

      <Card className="border-border/70">
        <CardContent className="flex flex-col items-start gap-4 sm:flex-row">
          <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary/25 to-sky/25 text-lg font-semibold text-primary ring-2 ring-primary/15">
            {displayName[0]?.toUpperCase() ?? "?"}
          </span>
          <div className="min-w-0 flex-1 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-base font-semibold text-foreground">{displayName}</p>
              <Badge variant="secondary">Active customer account</Badge>
            </div>
            <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Mail className="size-3.5 shrink-0" aria-hidden="true" />
                <dt className="sr-only">Email</dt>
                <dd className="truncate">{user.email ?? "—"}</dd>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Building2 className="size-3.5 shrink-0" aria-hidden="true" />
                <dt className="sr-only">Portal</dt>
                <dd className="truncate">{portal.brandName ?? "This portal"}</dd>
              </div>
              {membership ? (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Calendar className="size-3.5 shrink-0" aria-hidden="true" />
                  <dt className="sr-only">Customer since</dt>
                  <dd>Customer since {formatDate(membership.createdAt)}</dd>
                </div>
              ) : null}
            </dl>
          </div>
          <EditProfileNameDialog slug={slug} currentName={user.fullName ?? ""} />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Feedback submitted"
          value={stats.total}
          icon={<ListChecks className="size-5" aria-hidden="true" />}
          href={`/feedback/${slug}/my-feedback`}
          accent="primary"
        />
        <StatCard
          label="Open"
          value={stats.open}
          icon={<CircleDot className="size-5" aria-hidden="true" />}
          href={`/feedback/${slug}/my-feedback?closed=false`}
          accent="info"
        />
        <StatCard
          label="Resolved"
          value={stats.resolved}
          icon={<CheckCircle2 className="size-5" aria-hidden="true" />}
          href={`/feedback/${slug}/my-feedback?closed=true`}
          accent="success"
        />
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Recent feedback</h2>
          {recent.length > 0 ? (
            <Link
              href={`/feedback/${slug}/my-feedback`}
              className="text-xs font-medium text-primary hover:underline"
            >
              View all
            </Link>
          ) : null}
        </div>

        {recent.length === 0 ? (
          <EmptyState
            icon={<MessageSquareDashed className="size-5" aria-hidden="true" />}
            title="No feedback yet"
            description="Submissions you make in this portal will show up here."
          />
        ) : (
          <div className="space-y-2">
            {recent.map((submission) => (
              <Link
                key={submission.id}
                href={`/feedback/${slug}/${submission.id}`}
                className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-card px-4 py-3 shadow-[0_1px_2px_hsl(var(--shadow-color)/0.06)] transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/20 hover:shadow-md"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{submission.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {formatDate(submission.createdAt)} ·{" "}
                    <span style={{ color: submission.statusColor }}>{submission.statusName}</span>
                  </p>
                </div>
                <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground tabular-nums">
                  <ArrowBigUp className="size-3.5" aria-hidden="true" />
                  {submission.voteCount}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

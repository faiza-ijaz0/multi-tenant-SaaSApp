import { ArrowLeft, History } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { describeAuditActor, describeAuditEvent, listAuditEvents, resolveAuditActorNames } from "@/features/audit/queries";
import { createMemberComment } from "@/features/comments/actions";
import { CommentForm } from "@/features/comments/comment-form";
import { CommentList } from "@/features/comments/comment-list";
import { listComments } from "@/features/comments/queries";
import { listStatuses } from "@/features/statuses/queries";
import { getSubmission } from "@/features/submissions/queries";
import { SubmissionDeleteButton, SubmissionEditDialog } from "@/features/submissions/submission-edit-dialog";
import { StatusSelect } from "@/features/submissions/status-select";
import { hasVoted } from "@/features/votes/queries";
import { VoteButton } from "@/features/votes/vote-button";

import { PageHeader } from "@/components/states/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { getTenantScope } from "@/lib/auth/context";
import { getEffectivePermissions, hasAction, hasPage } from "@/lib/authorization/permissions";
import { UnauthenticatedError } from "@/lib/auth/errors";
import { formatDate, formatDateTime } from "@/lib/format";
import { isUuid } from "@/lib/uuid";

interface SubmissionDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function SubmissionDetailPage({ params }: SubmissionDetailPageProps) {
  const { id } = await params;
  // submissions.id is a uuid column -- a malformed id here would otherwise
  // reach getSubmission's query and throw ("invalid input syntax for type
  // uuid"), which is an uncaught error, not the correct "this submission
  // doesn't exist" response. Checking shape first turns that into a clean
  // notFound() like any other nonexistent id.
  if (!isUuid(id)) notFound();

  let scope;
  try {
    scope = await getTenantScope();
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      redirect(`/login?next=/dashboard/submissions/${id}`);
    }
    // A dashboard-authenticated user reaching this page mid-navigation
    // without an organization would be unusual -- let it surface to the
    // error boundary rather than mask it with dashboard-index behavior.
    throw error;
  }

  const { supabase, organization, user } = scope;

  // Route-level protection: /dashboard/submissions/[id] is covered by the
  // 'submissions' page permission (Phase: dashboard/submissions split) --
  // detail is part of the submissions management surface, not the
  // dashboard overview. See lib/authorization/registry.ts's PAGE_KEYS
  // comment for why 'dashboard' no longer implies 'submissions'.
  const permissions = await getEffectivePermissions(scope);
  if (!hasPage(permissions, "submissions")) {
    notFound();
  }

  const submission = await getSubmission(supabase, organization.id, id);
  if (!submission) notFound();

  const isAuthor = submission.submittedBy === user.id;
  const canEditStatus = hasAction(permissions, "submissions:edit") || hasAction(permissions, "submissions:manage");
  const canEditContent = isAuthor || hasAction(permissions, "submissions:edit");
  const canDeleteSubmission = hasAction(permissions, "submissions:delete");
  const canModerateComments = hasAction(permissions, "comments:moderate");
  const canCreateComments = hasAction(permissions, "comments:create");
  // audit_events_select_admin is gated by the 'activity' page permission
  // (0013), not role -- see app/dashboard/activity/page.tsx's own comment
  // on why this must be checked before treating an empty result as
  // "no history" instead of "you can't see this".
  const canViewHistory = hasPage(permissions, "activity");

  const [comments, voted, statuses, history] = await Promise.all([
    listComments(supabase, id),
    hasVoted(supabase, id, user.id),
    canEditStatus ? listStatuses(supabase, organization.id) : Promise.resolve([]),
    canViewHistory ? listAuditEvents(supabase, organization.id, { entityId: id }) : Promise.resolve([]),
  ]);

  // Real names only -- never a truncated profile_id. Resolves both the
  // submission author and every history event's actor in one request (the
  // same get_organization_contact_profiles RPC features/members/queries.ts's
  // enrichMembersWithContactInfo already uses).
  const actorNames = await resolveAuditActorNames(supabase, organization.id, [
    submission.submittedBy,
    ...history.map((event) => event.actorProfileId),
  ]);

  const authorLabel = isAuthor
    ? "You"
    : submission.submittedBy
      ? (actorNames.get(submission.submittedBy) ?? "A former member")
      : "Unknown";
  const boundCommentAction = createMemberComment.bind(null, id);

  // Every row has updated_at = created_at at insert time (see 0001's
  // set_updated_at trigger) -- only show "Updated" once it has actually
  // diverged, so an untouched submission doesn't display a redundant
  // "updated on the same instant it was created" line.
  const wasUpdated = new Date(submission.updatedAt).getTime() - new Date(submission.createdAt).getTime() > 1000;

  return (
    <div className="space-y-6">
      <Link
        href="/dashboard/submissions"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" aria-hidden="true" />
        Back to submissions
      </Link>

      <PageHeader
        eyebrow="Submission"
        title={submission.title}
        description={`${submission.categoryName ?? "Uncategorized"} · Submitted by ${authorLabel} on ${formatDate(
          submission.createdAt,
        )}${wasUpdated ? ` · Updated ${formatDate(submission.updatedAt)}` : ""}`}
        actions={
          <div className="flex items-center gap-2">
            <VoteButton submissionId={id} voteCount={submission.voteCount} hasVoted={voted} />
            <Badge variant={submission.type === "bug" ? "destructive" : "secondary"}>{submission.type}</Badge>
            {canEditContent ? (
              <SubmissionEditDialog
                submissionId={id}
                title={submission.title}
                description={submission.description}
              />
            ) : null}
            {canDeleteSubmission ? <SubmissionDeleteButton submissionId={id} /> : null}
          </div>
        }
      />

      <Card>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground">Status</span>
            {canEditStatus ? (
              <StatusSelect submissionId={id} currentStatusId={submission.statusId} statuses={statuses} />
            ) : (
              <span className="flex items-center gap-1.5 text-sm" style={{ color: submission.statusColor }}>
                <span className="size-1.5 rounded-full" style={{ backgroundColor: submission.statusColor }} />
                {submission.statusName}
              </span>
            )}
          </div>
          {submission.description ? (
            <p className="whitespace-pre-wrap text-sm text-foreground">{submission.description}</p>
          ) : (
            <p className="text-sm text-muted-foreground">No description provided.</p>
          )}
        </CardContent>
      </Card>

      {canViewHistory && history.length > 0 ? (
        <div className="space-y-2">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <History className="size-3.5 text-muted-foreground" aria-hidden="true" />
            History
          </h2>
          <div className="space-y-1.5 rounded-lg border border-border p-3">
            {history.map((event) => (
              <p key={event.id} className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{describeAuditActor(event.actorProfileId, user.id, actorNames)}</span>{" "}
                {describeAuditEvent(event)} on {formatDateTime(event.createdAt)} UTC
              </p>
            ))}
          </div>
        </div>
      ) : null}

      <div className="space-y-4">
        <h2 className="text-sm font-semibold text-foreground">Comments</h2>
        <CommentList
          comments={comments}
          submissionId={id}
          currentUserId={user.id}
          canModerate={canModerateComments}
        />
        {canCreateComments ? (
          <CommentForm action={boundCommentAction} allowInternal={canCreateComments} />
        ) : null}
      </div>
    </div>
  );
}

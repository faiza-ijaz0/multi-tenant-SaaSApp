import { ArrowLeft, ListChecks } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { createPortalComment } from "@/features/comments/actions";
import { CommentForm } from "@/features/comments/comment-form";
import { CommentList } from "@/features/comments/comment-list";
import { listComments } from "@/features/comments/queries";
import { resolveCustomerIdentity } from "@/features/customers/customer-eligibility";
import { getPortalBySlug } from "@/features/portal-settings/queries";
import { getSubmission } from "@/features/submissions/queries";
import { hasVoted } from "@/features/votes/queries";
import { VoteButton } from "@/features/votes/vote-button";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/uuid";

interface PortalSubmissionPageProps {
  params: Promise<{ slug: string; id: string }>;
}

/**
 * No status-history section here: audit_events (the only place a status
 * change over time is recorded) is admin-only per audit_events' own RLS
 * (see tests/integration/rls/rls-policies.test.ts's "anon cannot access
 * audit_events" and its customer-scoped equivalent) -- customers, including
 * the submission's own author, only ever see the *current* status, never a
 * timeline of past ones. Not added here rather than faked.
 */
export default async function PortalSubmissionPage({ params }: PortalSubmissionPageProps) {
  const { slug, id } = await params;
  const supabase = await createClient();

  const portal = await getPortalBySlug(supabase, slug);
  if (!portal) notFound();

  // See app/dashboard/submissions/[id]/page.tsx for why this check exists:
  // without it, a malformed id throws instead of resolving to notFound(),
  // and on a public route that would be a needless behavioral tell
  // (error page vs. not-found page) between "malformed id" and "real,
  // nonexistent id" -- both should look identical to a visitor.
  if (!isUuid(id)) notFound();

  const submission = await getSubmission(supabase, portal.organizationId, id);
  if (!submission) notFound();

  // A *customer* identity for this org (Phase 4) -- an internal
  // owner/admin/member of this exact org resolves to null too, same as an
  // anonymous visitor (see resolveCustomerIdentity's own comment).
  const user = await resolveCustomerIdentity(supabase, portal.organizationId);

  const [comments, voted] = await Promise.all([
    listComments(supabase, id),
    user ? hasVoted(supabase, id, user.id) : Promise.resolve(false),
  ]);

  const boundCommentAction = createPortalComment.bind(null, slug, id);
  const isOwnSubmission = Boolean(user && submission.submittedBy === user.id);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <Link
          href={`/feedback/${slug}`}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          Back to portal
        </Link>
        {isOwnSubmission ? (
          <Link
            href={`/feedback/${slug}/my-feedback`}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ListChecks className="size-3.5" aria-hidden="true" />
            Back to My Feedback
          </Link>
        ) : null}
      </div>

      <div className="relative overflow-hidden rounded-2xl border border-border/70 bg-gradient-to-br from-card via-card to-primary/5 p-6 shadow-[0_1px_2px_hsl(var(--shadow-color)/0.06)] ring-1 ring-foreground/5 sm:p-8">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute top-0 right-0 size-48 rounded-full bg-primary/10 blur-3xl"
        />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={submission.type === "bug" ? "destructive" : "secondary"}>{submission.type}</Badge>
              <span
                className="flex items-center gap-1.5 rounded-full border border-border px-2 py-0.5 text-xs"
                style={{ color: submission.statusColor }}
              >
                <span className="size-1.5 rounded-full" style={{ backgroundColor: submission.statusColor }} />
                {submission.statusName}
              </span>
            </div>
            <h1 className="mt-3 font-heading text-2xl font-semibold tracking-tight text-balance text-foreground sm:text-3xl">
              {submission.title}
            </h1>
            <p className="mt-2 text-xs text-muted-foreground">
              {submission.categoryName ?? "Uncategorized"} · Submitted {formatDate(submission.createdAt)}
              {submission.updatedAt !== submission.createdAt ? ` · Updated ${formatDate(submission.updatedAt)}` : ""}
            </p>
          </div>
          <VoteButton submissionId={id} voteCount={submission.voteCount} hasVoted={voted} />
        </div>
      </div>

      {submission.description ? (
        <Card className="border-border/70">
          <CardContent>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{submission.description}</p>
          </CardContent>
        </Card>
      ) : null}

      <div className="space-y-4">
        <h2 className="text-sm font-semibold text-foreground">Comments</h2>
        <CommentList
          comments={comments}
          submissionId={id}
          currentUserId={user?.id ?? ""}
          canModerate={false}
        />
        {user ? (
          <CommentForm action={boundCommentAction} />
        ) : (
          <p className="text-sm text-muted-foreground">
            <Link
              href={`/feedback/sign-in?next=/feedback/${slug}/${id}`}
              className="font-medium text-primary hover:underline"
            >
              Sign in
            </Link>{" "}
            to comment.
          </p>
        )}
      </div>
    </div>
  );
}

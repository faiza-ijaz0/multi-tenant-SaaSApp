"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/states/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";

import { deleteComment } from "./actions";
import type { Comment } from "./queries";

function DeleteCommentButton({ commentId, submissionId }: { commentId: string; submissionId: string }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  return (
    <>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Delete comment"
        disabled={isPending}
        onClick={() => setConfirmOpen(true)}
      >
        <Trash2 className="size-3.5" aria-hidden="true" />
      </Button>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Delete this comment?"
        confirmLabel="Delete"
        destructive
        onConfirm={() =>
          startTransition(async () => {
            const result = await deleteComment(commentId, submissionId);
            if (!result.ok) toast.error(result.message ?? "Something went wrong.");
          })
        }
      />
    </>
  );
}

/**
 * currentUserId/canModerate control only whether the delete icon renders --
 * comments_delete_author_or_admin (extended by 0013 with
 * AND has_action_permission(org, 'comments:moderate') on the admin branch)
 * remains the actual authorization boundary regardless of this prop. An
 * author always sees their own delete icon; a non-author sees one only with
 * comments:moderate.
 */
export function CommentList({
  comments,
  submissionId,
  currentUserId,
  canModerate,
}: {
  comments: Comment[];
  submissionId: string;
  currentUserId: string;
  canModerate: boolean;
}) {
  if (comments.length === 0) {
    return <p className="text-sm text-muted-foreground">No comments yet.</p>;
  }

  return (
    <div className="space-y-3">
      {comments.map((comment) => {
        const isAuthor = comment.authorProfileId === currentUserId;
        const canDelete = isAuthor || canModerate;
        return (
          <div
            key={comment.id}
            className="flex items-start justify-between gap-2 rounded-lg border border-border px-3 py-2"
          >
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground">
                  {isAuthor
                    ? "You"
                    : comment.authorProfileId
                      ? `User ${comment.authorProfileId.slice(0, 8)}`
                      : "Deleted user"}
                </span>
                {comment.isInternal ? <Badge variant="secondary">Internal</Badge> : null}
                <span className="text-xs text-muted-foreground">{formatDate(comment.createdAt)}</span>
              </div>
              <p className="whitespace-pre-wrap text-sm text-foreground">{comment.body}</p>
            </div>
            {canDelete ? (
              <DeleteCommentButton commentId={comment.id} submissionId={submissionId} />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

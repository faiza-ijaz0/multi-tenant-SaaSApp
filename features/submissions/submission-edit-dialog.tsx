"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/states/confirm-dialog";
import { FormError } from "@/components/auth/form-error";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import { deleteSubmission, updateSubmissionContent } from "./actions";
import { initialSubmissionFormState, MAX_DESCRIPTION_LENGTH, MAX_TITLE_LENGTH } from "./form-state";

/**
 * Content-only edit (title/description) -- type and category aren't part of
 * updateSubmissionContent (features/submissions/actions.ts), which gates on
 * submitted_by = auth.uid() OR submissions:edit/manage
 * (submissions_update_author_or_member, 0010/0013). Only rendered by the
 * caller when the caller is either the author or holds that grant -- see
 * app/dashboard/submissions/[id]/page.tsx.
 */
function EditSubmissionForm({
  submissionId,
  title,
  description,
  onSuccess,
}: {
  submissionId: string;
  title: string;
  description: string | null;
  onSuccess: () => void;
}) {
  const boundUpdate = updateSubmissionContent.bind(null, submissionId);
  const [state, formAction, isPending] = useActionState(boundUpdate, initialSubmissionFormState);

  useEffect(() => {
    if (state !== initialSubmissionFormState && state.status === "idle") {
      onSuccess();
    }
  }, [state, onSuccess]);

  return (
    <>
      <FormError message={state.status === "error" ? state.message : undefined} />
      <form action={formAction} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="edit-submission-title">Title</Label>
          <Input
            id="edit-submission-title"
            name="title"
            required
            defaultValue={title}
            maxLength={MAX_TITLE_LENGTH}
            aria-invalid={Boolean(state.fieldErrors?.title)}
          />
          {state.fieldErrors?.title ? (
            <p className="text-xs text-destructive">{state.fieldErrors.title}</p>
          ) : null}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="edit-submission-description">Description</Label>
          <Textarea
            id="edit-submission-description"
            name="description"
            defaultValue={description ?? ""}
            maxLength={MAX_DESCRIPTION_LENGTH}
            aria-invalid={Boolean(state.fieldErrors?.description)}
          />
          {state.fieldErrors?.description ? (
            <p className="text-xs text-destructive">{state.fieldErrors.description}</p>
          ) : null}
        </div>
        <DialogFooter>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}

export function SubmissionEditDialog({
  submissionId,
  title,
  description,
}: {
  submissionId: string;
  title: string;
  description: string | null;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Pencil className="size-3.5" aria-hidden="true" />
          Edit
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit submission</DialogTitle>
        </DialogHeader>
        {open ? (
          <EditSubmissionForm
            submissionId={submissionId}
            title={title}
            description={description}
            onSuccess={() => setOpen(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Delete has no author branch in submissions_delete_admin -- admin-only,
 * gated by submissions:delete. Redirects to /dashboard since the detail
 * page it's rendered on no longer exists after the delete succeeds.
 */
export function SubmissionDeleteButton({ submissionId }: { submissionId: string }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        disabled={isPending}
        onClick={() => setConfirmOpen(true)}
        className="text-destructive hover:text-destructive"
      >
        <Trash2 className="size-3.5" aria-hidden="true" />
        Delete
      </Button>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Delete this submission?"
        description="This can't be undone. Votes and comments on it will be deleted too."
        confirmLabel="Delete"
        destructive
        onConfirm={() =>
          startTransition(async () => {
            const result = await deleteSubmission(submissionId);
            if (!result.ok) {
              toast.error(result.message ?? "Something went wrong.");
              return;
            }
            router.push("/dashboard");
          })
        }
      />
    </>
  );
}

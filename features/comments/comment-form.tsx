"use client";

import { useActionState, useEffect, useRef } from "react";

import { FormError } from "@/components/auth/form-error";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import { initialCommentFormState, MAX_COMMENT_LENGTH, type CommentFormState } from "./form-state";

type CommentAction = (state: CommentFormState, formData: FormData) => Promise<CommentFormState>;

interface CommentFormProps {
  action: CommentAction;
  allowInternal?: boolean;
  submitLabel?: string;
}

export function CommentForm({ action, allowInternal = false, submitLabel = "Post comment" }: CommentFormProps) {
  const [state, formAction, isPending] = useActionState(action, initialCommentFormState);
  const formRef = useRef<HTMLFormElement>(null);

  // Same pattern as SubmissionForm -- clears the textarea (and the
  // internal-note checkbox) after a genuine successful post, instead of
  // leaving the just-submitted text sitting there looking unsent.
  useEffect(() => {
    if (state !== initialCommentFormState && state.status === "idle") {
      formRef.current?.reset();
    }
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="space-y-3" noValidate>
      <FormError message={state.status === "error" ? state.message : undefined} />
      <Label htmlFor="comment-body" className="sr-only">
        Comment
      </Label>
      <Textarea
        id="comment-body"
        name="body"
        required
        maxLength={MAX_COMMENT_LENGTH}
        placeholder="Write a comment…"
        aria-invalid={Boolean(state.fieldErrors?.body)}
      />
      {state.fieldErrors?.body ? <p className="text-xs text-destructive">{state.fieldErrors.body}</p> : null}
      <div className="flex items-center justify-between gap-3">
        {allowInternal ? (
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input type="checkbox" name="isInternal" className="size-4 rounded border-input" />
            Internal note (team only)
          </label>
        ) : (
          <span />
        )}
        <Button type="submit" disabled={isPending} size="sm">
          {isPending ? "Posting…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}

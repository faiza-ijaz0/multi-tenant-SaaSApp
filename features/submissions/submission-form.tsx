"use client";

import { useActionState, useEffect, useRef } from "react";

import type { Category } from "@/features/categories/queries";

import { FormError } from "@/components/auth/form-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";

import { initialSubmissionFormState, MAX_DESCRIPTION_LENGTH, MAX_TITLE_LENGTH, type SubmissionFormState } from "./form-state";

type SubmissionAction = (state: SubmissionFormState, formData: FormData) => Promise<SubmissionFormState>;

export function SubmissionForm({
  action,
  categories,
  onSuccess,
}: {
  action: SubmissionAction;
  categories: Category[];
  /** Called once per successful submission -- e.g. SubmitFeedbackDialog uses
   * this to toast + close itself. Optional: callers that render this form
   * inline on the page (not inside a dialog) have no need for it. */
  onSuccess?: () => void;
}) {
  const [state, formAction, isPending] = useActionState(action, initialSubmissionFormState);
  const formRef = useRef<HTMLFormElement>(null);

  // Same success-detection trick as features/categories/category-manager.tsx's
  // CreateCategoryForm (state !== the exact initial object reference is only
  // ever true after a real submission, since "idle" is also success's own
  // resting state) -- here it clears the form instead of closing a dialog,
  // since this form isn't inside one and would otherwise sit there still
  // full of the just-submitted title/description after a successful post.
  useEffect(() => {
    if (state !== initialSubmissionFormState && state.status === "idle") {
      formRef.current?.reset();
      onSuccess?.();
    }
    // onSuccess is passed fresh on every render by design (an inline closure
    // capturing dialog state) -- only `state` transitioning should re-run this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="space-y-4" noValidate>
      <FormError message={state.status === "error" ? state.message : undefined} />
      <div className="space-y-1.5">
        <Label htmlFor="submission-title">Title</Label>
        <Input
          id="submission-title"
          name="title"
          required
          maxLength={MAX_TITLE_LENGTH}
          aria-invalid={Boolean(state.fieldErrors?.title)}
        />
        {state.fieldErrors?.title ? (
          <p className="text-xs text-destructive">{state.fieldErrors.title}</p>
        ) : null}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="submission-description">Description</Label>
        <Textarea
          id="submission-description"
          name="description"
          maxLength={MAX_DESCRIPTION_LENGTH}
          aria-invalid={Boolean(state.fieldErrors?.description)}
        />
        {state.fieldErrors?.description ? (
          <p className="text-xs text-destructive">{state.fieldErrors.description}</p>
        ) : null}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="submission-type">Type</Label>
          <NativeSelect id="submission-type" name="type" required defaultValue="feature">
            <option value="feature">Feature request</option>
            <option value="bug">Bug report</option>
          </NativeSelect>
          {state.fieldErrors?.type ? (
            <p className="text-xs text-destructive">{state.fieldErrors.type}</p>
          ) : null}
        </div>
        {categories.length > 0 ? (
          <div className="space-y-1.5">
            <Label htmlFor="submission-category">Category (optional)</Label>
            <NativeSelect id="submission-category" name="categoryId" defaultValue="">
              <option value="">No category</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </NativeSelect>
          </div>
        ) : null}
      </div>
      <Button type="submit" disabled={isPending}>
        {isPending ? "Submitting…" : "Submit feedback"}
      </Button>
    </form>
  );
}

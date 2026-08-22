"use client";

import { useState } from "react";
import { MessageSquarePlus } from "lucide-react";
import { toast } from "sonner";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { Category } from "@/features/categories/queries";
import { createPublicSubmission } from "@/features/submissions/actions";
import { SubmissionForm } from "@/features/submissions/submission-form";
import type { VariantProps } from "class-variance-authority";

interface SubmitFeedbackDialogProps {
  slug: string;
  categories: Category[];
  triggerLabel?: string;
  triggerVariant?: VariantProps<typeof buttonVariants>["variant"];
  triggerSize?: VariantProps<typeof buttonVariants>["size"];
  triggerClassName?: string;
}

/**
 * The one, reusable "Share Feedback" entry point -- rendered from the
 * portal header (every page) and the Home hero, so a customer never has to
 * navigate away from wherever they are to submit an idea. Wraps the exact
 * same createPublicSubmission Server Action and SubmissionForm the old
 * Home-page inline card used (features/submissions/*) -- no parallel
 * submission logic, just a dialog shell around it. Success is detected via
 * SubmissionForm's onSuccess (its state has no dedicated "success" status;
 * "idle" after a real post *is* success -- see that component's comment),
 * which toasts and closes here rather than requiring a manual dismiss.
 */
export function SubmitFeedbackDialog({
  slug,
  categories,
  triggerLabel = "Share Feedback",
  triggerVariant = "default",
  triggerSize = "default",
  triggerClassName,
}: SubmitFeedbackDialogProps) {
  const [open, setOpen] = useState(false);
  const boundAction = createPublicSubmission.bind(null, slug);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant={triggerVariant} size={triggerSize} className={triggerClassName}>
          <MessageSquarePlus className="size-4" data-icon="inline-start" aria-hidden="true" />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Share feedback</DialogTitle>
          <DialogDescription>
            Tell us what&apos;s on your mind -- an idea, a request, or something that isn&apos;t working.
          </DialogDescription>
        </DialogHeader>
        {open ? (
          <SubmissionForm
            action={boundAction}
            categories={categories}
            onSuccess={() => {
              toast.success("Thanks -- your feedback was submitted.");
              setOpen(false);
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

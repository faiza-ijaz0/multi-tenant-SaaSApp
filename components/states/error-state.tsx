import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ErrorStateProps {
  title?: string;
  description?: string;
  onRetry?: () => void;
  className?: string;
}

/**
 * Generic, user-facing error display. Never pass raw error messages or
 * stack traces into `description` — those belong in server logs, not the UI.
 */
export function ErrorState({
  title = "Something went wrong",
  description = "An unexpected error occurred. Please try again.",
  onRetry,
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-2xl border border-destructive/20 bg-destructive/[0.03] px-6 py-16 text-center",
        className,
      )}
    >
      <div className="flex size-12 items-center justify-center rounded-xl bg-gradient-to-br from-destructive/20 to-destructive/5 text-destructive ring-1 ring-destructive/15">
        <AlertTriangle className="size-5" aria-hidden="true" />
      </div>
      <div className="space-y-1.5">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="max-w-sm text-sm text-muted-foreground/90">
          {description}
        </p>
      </div>
      {onRetry ? (
        <Button variant="outline" size="sm" className="mt-1" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}

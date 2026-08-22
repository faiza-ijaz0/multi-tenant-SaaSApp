"use client";

import { useEffect } from "react";

import { ErrorState } from "@/components/states/error-state";

/**
 * Regular error boundary for the root segment -- renders inside
 * app/layout.tsx's own <html>/<body>, same as app/dashboard/error.tsx and
 * app/feedback/error.tsx do for their segments. Must NOT render its own
 * <html>/<body> (that's app/global-error.tsx's job, for the separate case
 * where the root layout itself fails and there is no outer <html>/<body>
 * left to render into).
 */
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-svh flex-1 items-center justify-center px-6">
      <ErrorState
        title="Something went wrong"
        description="An unexpected error occurred. Please try again."
        onRetry={reset}
      />
    </main>
  );
}

"use client";

import { useEffect } from "react";

import { ErrorState } from "@/components/states/error-state";

export default function GlobalError({
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
    <html lang="en">
      <body className="flex min-h-svh items-center justify-center px-6">
        <ErrorState
          title="Something went wrong"
          description="An unexpected error occurred. Please try again."
          onRetry={reset}
        />
      </body>
    </html>
  );
}

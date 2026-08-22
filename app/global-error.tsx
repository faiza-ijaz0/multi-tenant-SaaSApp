"use client";

import { useEffect } from "react";

import { ErrorState } from "@/components/states/error-state";

/**
 * Only fires when the root layout itself (app/layout.tsx) throws -- the one
 * case app/error.tsx cannot catch, since error.tsx renders as a child of
 * the root layout and depends on it having rendered successfully. Because
 * this replaces the root layout entirely when active, it must supply its
 * own <html>/<body> (Next.js's documented requirement for this file) --
 * unlike every other error/not-found boundary in this app, which render
 * inside an already-mounted <html>/<body> and must not repeat it.
 */
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

"use client";

import { useEffect } from "react";

import { ErrorState } from "@/components/states/error-state";

export default function DashboardError({
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
    <ErrorState
      title="Couldn't load this page"
      description="Something went wrong loading this section of the dashboard."
      onRetry={reset}
    />
  );
}

import { FileQuestion } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/states/empty-state";
import { Button } from "@/components/ui/button";

/**
 * Renders inside app/dashboard/layout.tsx (sidebar/topbar intact) for any
 * notFound() triggered by a page under /dashboard/* -- without this, that
 * call falls through to the root app/not-found.tsx instead, which drops
 * the user out of the dashboard shell entirely for what should be a
 * routine "this submission doesn't exist" case.
 */
export default function DashboardNotFound() {
  return (
    <EmptyState
      icon={<FileQuestion className="size-5" aria-hidden="true" />}
      title="Not found"
      description="This page doesn't exist, or you don't have access to it."
      action={
        <Button asChild size="sm">
          <Link href="/dashboard">Back to dashboard</Link>
        </Button>
      }
    />
  );
}

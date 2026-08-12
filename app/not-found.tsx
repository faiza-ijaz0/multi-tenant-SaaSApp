import Link from "next/link";
import { FileQuestion } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/states/empty-state";

export default function NotFound() {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-24">
      <EmptyState
        icon={<FileQuestion className="size-5" aria-hidden="true" />}
        title="Page not found"
        description="The page you're looking for doesn't exist or may have moved."
        action={
          <Button asChild size="sm">
            <Link href="/">Go home</Link>
          </Button>
        }
      />
    </main>
  );
}

import { FileQuestion } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/states/empty-state";
import { Button } from "@/components/ui/button";

/**
 * Renders inside app/feedback/layout.tsx's Container for any
 * notFound() under /feedback/*. This one message covers three cases on
 * purpose, with identical copy for all of them: the slug doesn't exist,
 * the slug exists but the portal is private, and a submission id is
 * malformed or doesn't belong to this portal. Distinguishing any of those
 * from each other would leak which private portals/slugs are real --
 * exactly what portal_settings_select_member_or_public and
 * getPortalBySlug's own doc comment already treat as the intentional
 * anti-enumeration boundary (see features/portal-settings/queries.ts).
 */
export default function PortalNotFound() {
  return (
    <EmptyState
      icon={<FileQuestion className="size-5" aria-hidden="true" />}
      title="Not found"
      description="This page doesn't exist or isn't available."
      action={
        <Button asChild size="sm">
          <Link href="/feedback">Back to feedback</Link>
        </Button>
      }
    />
  );
}

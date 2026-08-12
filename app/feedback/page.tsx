import { MessageSquare } from "lucide-react";

import { EmptyState } from "@/components/states/empty-state";

export default function PortalPage() {
  return (
    <EmptyState
      icon={<MessageSquare className="size-5" aria-hidden="true" />}
      title="Public portal foundation ready"
      description="Organization feedback portals land in an upcoming development phase."
    />
  );
}

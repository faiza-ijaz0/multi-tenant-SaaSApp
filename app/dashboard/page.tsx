import { Inbox } from "lucide-react";

import { EmptyState } from "@/components/states/empty-state";
import { PageHeader } from "@/components/states/page-header";

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Submissions"
        description="Feature requests and bug reports for your organization."
      />
      <EmptyState
        icon={<Inbox className="size-5" aria-hidden="true" />}
        title="Submissions foundation ready"
        description="Submission management lands in an upcoming development phase."
      />
    </div>
  );
}

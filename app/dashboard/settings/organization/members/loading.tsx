import { Skeleton } from "@/components/ui/skeleton";

export default function OrganizationMembersLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2 border-b border-border pb-5">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-7 w-52" />
        <Skeleton className="h-4 w-64" />
      </div>
      <Skeleton className="h-64 w-full rounded-2xl" />
    </div>
  );
}

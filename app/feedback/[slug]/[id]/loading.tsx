import { Skeleton } from "@/components/ui/skeleton";

export default function PortalSubmissionLoading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-4 w-28" />
      <div className="space-y-2 border-b border-border pb-5">
        <Skeleton className="h-7 w-72" />
        <Skeleton className="h-4 w-48" />
      </div>
      <Skeleton className="h-24 w-full rounded-xl" />
      <div className="space-y-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-16 w-full rounded-lg" />
      </div>
    </div>
  );
}

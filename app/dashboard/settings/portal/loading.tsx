import { Skeleton } from "@/components/ui/skeleton";

export default function PortalSettingsLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2 border-b border-border pb-5">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-7 w-36" />
        <Skeleton className="h-4 w-72" />
      </div>
      <Skeleton className="h-96 w-full rounded-xl" />
    </div>
  );
}

import { Skeleton } from "@/components/ui/skeleton";

export default function ActivityLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2 border-b border-border pb-5">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-7 w-28" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} className="h-14 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}

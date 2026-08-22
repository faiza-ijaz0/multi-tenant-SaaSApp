import { Skeleton } from "@/components/ui/skeleton";

export default function PortalListLoading() {
  return (
    <div className="space-y-8">
      <Skeleton className="h-32 w-full rounded-2xl" />
      <Skeleton className="h-40 w-full rounded-xl" />
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-16 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}

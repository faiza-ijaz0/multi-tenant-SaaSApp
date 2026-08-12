import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-24">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-4 w-48" />
    </main>
  );
}

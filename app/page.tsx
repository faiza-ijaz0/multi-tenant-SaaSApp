import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-24 text-center">
      <p className="text-sm font-medium text-muted-foreground">SignalBoard</p>
      <h1 className="mt-3 max-w-xl text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
        Customer feedback and product insights, in one place.
      </h1>
      <p className="mt-4 max-w-md text-sm text-muted-foreground">
        Application foundation is running. Feature work begins in the next
        development phase.
      </p>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Button asChild>
          <Link href="/dashboard">Open dashboard</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/feedback">View public portal</Link>
        </Button>
      </div>
    </main>
  );
}

import type { ReactNode } from "react";
import Link from "next/link";

/**
 * Shared by the (auth), onboarding, and invite layouts -- these were three
 * copies of the exact same markup; centralizing it means the brand
 * treatment can't drift between them again.
 */
export function CenteredBrandLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh w-full flex-col items-center justify-center gap-10 px-4 py-12">
      <Link href="/" className="flex items-center gap-2 text-foreground">
        <span
          aria-hidden="true"
          className="flex size-7 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground"
        >
          S
        </span>
        <span className="text-base font-semibold tracking-tight">SignalBoard</span>
      </Link>
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}

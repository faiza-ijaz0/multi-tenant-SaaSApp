import type { ReactNode } from "react";
import Link from "next/link";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh w-full flex-col items-center justify-center gap-8 px-4 py-12">
      <Link href="/" className="text-sm font-semibold tracking-tight text-foreground">
        SignalBoard
      </Link>
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}

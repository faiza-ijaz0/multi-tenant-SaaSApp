import type { ReactNode } from "react";
import Link from "next/link";

/**
 * The customer-facing counterpart to components/layout/centered-brand-layout.tsx
 * (used by the internal /login, /signup, /forgot-password, /reset-password,
 * /onboarding, /invite pages) -- deliberately a separate component, not a
 * shared one with a prop toggle, so the two visual identities can never
 * accidentally drift onto the same markup. This is the only place the
 * customer auth journey's premium gradient/glow treatment is defined.
 */
export function CustomerAuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex w-full flex-1 flex-col items-center justify-center gap-10 py-12">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]"
      >
        <div className="absolute top-[-8rem] left-1/2 h-[32rem] w-[48rem] -translate-x-1/2 rounded-full bg-gradient-to-br from-primary/25 via-sky/20 to-accent/30 blur-3xl" />
      </div>

      <Link href="/" className="flex items-center gap-2 text-foreground">
        <span
          aria-hidden="true"
          className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-sky text-sm font-semibold text-primary-foreground shadow-[0_4px_16px_-4px_hsl(var(--shadow-color)/0.4)]"
        >
          S
        </span>
        <span className="text-base font-semibold tracking-tight">SignalBoard</span>
      </Link>

      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}

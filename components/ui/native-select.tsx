import type { ComponentProps } from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * A styled wrapper around a plain native `<select>` -- deliberately NOT the
 * Radix Select primitive (components/ui/select.tsx). Every current caller
 * (submissions filter form, member role filter/pickers) either relies on
 * native GET-form serialization (name + defaultValue, no JS) or is a
 * simple controlled value/onChange -- swapping to Radix would mean turning
 * a Server Component filter form into a client component and manually
 * rebuilding the query string, a functional rewrite this pass explicitly
 * avoids. This only replaces the *visual* chrome (custom chevron,
 * consistent border/hover/focus) that every caller used to hand-roll via
 * an identical local `selectClassName` constant.
 */
export function NativeSelect({ className, ...props }: ComponentProps<"select">) {
  return (
    <div className="relative">
      <select
        data-slot="native-select"
        className={cn(
          "h-8 w-full appearance-none rounded-lg border border-input bg-transparent py-1 pr-7 pl-2.5 text-sm outline-none transition-colors hover:border-ring/50 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        {...props}
      />
      <ChevronDown
        className="pointer-events-none absolute top-1/2 right-2 size-3.5 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
    </div>
  );
}

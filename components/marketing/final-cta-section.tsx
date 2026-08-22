import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";

interface FinalCtaSectionProps {
  primaryHref: string;
  primaryLabel: string;
}

export function FinalCtaSection({ primaryHref, primaryLabel }: FinalCtaSectionProps) {
  return (
    <section className="mx-auto w-full max-w-6xl px-4 pb-24 sm:px-6 lg:px-8">
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary via-primary to-sky px-6 py-16 text-center shadow-[0_24px_60px_-20px_hsl(var(--shadow-color)/0.4)] sm:px-12 sm:py-20">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 20%, white 0%, transparent 40%), radial-gradient(circle at 80% 80%, white 0%, transparent 40%)",
          }}
        />
        <div className="relative mx-auto max-w-2xl">
          <h2 className="font-heading text-3xl font-semibold tracking-tight text-balance text-primary-foreground sm:text-4xl">
            Your customers already have ideas.
            <br />
            Give them one place to share them.
          </h2>
          <div className="mt-8 flex justify-center">
            <Button
              asChild
              size="lg"
              className="h-11 border-0 bg-primary-foreground px-7 text-sm text-primary hover:bg-primary-foreground/90"
            >
              <Link href={primaryHref}>
                {primaryLabel}
                <ArrowRight className="size-4 transition-transform duration-200 group-hover/button:translate-x-0.5" data-icon="inline-end" />
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

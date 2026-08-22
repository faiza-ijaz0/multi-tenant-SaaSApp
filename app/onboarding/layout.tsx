import type { ReactNode } from "react";

import { CenteredBrandLayout } from "@/components/layout/centered-brand-layout";

export default function OnboardingLayout({ children }: { children: ReactNode }) {
  return <CenteredBrandLayout>{children}</CenteredBrandLayout>;
}

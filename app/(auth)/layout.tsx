import type { ReactNode } from "react";

import { CenteredBrandLayout } from "@/components/layout/centered-brand-layout";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return <CenteredBrandLayout>{children}</CenteredBrandLayout>;
}

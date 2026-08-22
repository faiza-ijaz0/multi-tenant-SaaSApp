import type { ReactNode } from "react";

import { CenteredBrandLayout } from "@/components/layout/centered-brand-layout";

export default function InviteLayout({ children }: { children: ReactNode }) {
  return <CenteredBrandLayout>{children}</CenteredBrandLayout>;
}

import { Container } from "@/components/layout/container";
import { PortalHeader } from "@/components/layout/portal-header";

export default function PortalLayout({ children }: LayoutProps<"/feedback">) {
  return (
    <div className="flex min-h-svh w-full flex-col">
      <PortalHeader />
      <Container className="flex-1 py-8">{children}</Container>
    </div>
  );
}

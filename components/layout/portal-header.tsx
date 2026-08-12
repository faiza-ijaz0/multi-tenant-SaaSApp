import Link from "next/link";

import { Container } from "@/components/layout/container";

export function PortalHeader() {
  return (
    <header className="border-b border-border">
      <Container className="flex h-14 items-center">
        <Link href="/" className="text-sm font-semibold tracking-tight">
          SignalBoard
        </Link>
      </Container>
    </header>
  );
}

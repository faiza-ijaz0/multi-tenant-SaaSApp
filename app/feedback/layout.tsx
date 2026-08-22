import { Container } from "@/components/layout/container";

/**
 * Deliberately no header here: every route under /feedback now supplies its
 * own -- PortalEntryHeader for the pre-auth/pre-portal pages (/feedback,
 * /feedback/portal), nothing at all for the full-bleed customer auth
 * pages (/feedback/sign-in, /feedback/sign-up -- see CustomerAuthShell),
 * and CustomerPortalHeader (app/feedback/[slug]/layout.tsx) once a specific
 * organization's portal is open. A single shared PortalHeader stopped
 * fitting once those became visually distinct experiences. This layout's
 * remaining job is just the Container -- and it's still what wraps
 * not-found.tsx/error.tsx for anything under /feedback/* that doesn't
 * have its own nested layout to fall back on.
 */
export default function PortalLayout({ children }: LayoutProps<"/feedback">) {
  return (
    <div className="flex min-h-svh w-full flex-col">
      <Container className="flex flex-1 flex-col py-8">{children}</Container>
    </div>
  );
}

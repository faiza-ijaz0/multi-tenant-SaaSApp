import { notFound } from "next/navigation";

import { CustomerPortalHeader } from "@/components/customer-portal/customer-portal-header";
import { listCategories } from "@/features/categories/queries";
import { resolveCustomerIdentity } from "@/features/customers/customer-eligibility";
import { getPortalBySlug, sanitizePortalAccentColor } from "@/features/portal-settings/queries";
import { createClient } from "@/lib/supabase/server";

interface CustomerPortalLayoutProps {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}

/**
 * Wraps every page for one specific organization's open portal (Home, My
 * Feedback, Profile, a submission's detail page) with the org-aware
 * CustomerPortalHeader. Resolving the portal here, once, means every page
 * under this segment gets the same RLS-verified portal (never re-derived
 * from client input) without each page repeating the lookup -- pages still
 * do their own getPortalBySlug call too (Server Components don't share a
 * request-scoped cache across a layout/page boundary the way React's
 * cache() does within a single render tree here, since layout and page
 * render as siblings of the same params), but both calls are the same
 * cheap, RLS-scoped read, not a trust boundary being duplicated.
 *
 * Deliberately does NOT require authentication: an anonymous visitor to a
 * public portal can still browse (existing, preserved behavior) -- see
 * getPortalBySlug's own doc comment on the anti-enumeration notFound()
 * below, which covers "doesn't exist" and "exists but private" identically.
 *
 * `user` here is a *customer* identity, not just "someone is signed in" --
 * resolveCustomerIdentity (Phase 4) resolves to null for an authenticated
 * visitor who is actually an internal owner/admin/member of *this*
 * organization with no real customer relationship here, exactly like an
 * anonymous visitor: no account menu, no "Share Feedback" CTA, no My
 * Feedback/Profile access. That account's own Supabase session isn't
 * touched by visiting this page (they may still be a legitimate customer
 * of some other organization); it's simply never treated as a customer
 * identity for *this* one.
 */
export default async function CustomerPortalLayout({ children, params }: CustomerPortalLayoutProps) {
  const { slug } = await params;
  const supabase = await createClient();

  const portal = await getPortalBySlug(supabase, slug);
  if (!portal) notFound();

  const [user, categories] = await Promise.all([
    resolveCustomerIdentity(supabase, portal.organizationId),
    listCategories(supabase, portal.organizationId, { activeOnly: true }),
  ]);

  return (
    <div className="flex w-full flex-1 flex-col">
      <CustomerPortalHeader
        slug={slug}
        portalName={portal.brandName ?? "Feedback portal"}
        logoUrl={portal.logoUrl}
        accentColor={sanitizePortalAccentColor(portal.accentColor)}
        categories={categories}
        identity={user ? { fullName: user.fullName, email: user.email } : null}
      />
      <div className="flex-1 pb-12">{children}</div>
    </div>
  );
}

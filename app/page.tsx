import type { Metadata } from "next";

import { CustomerExperienceSection } from "@/components/marketing/customer-experience-section";
import { CustomerJourneySection } from "@/components/marketing/customer-journey-section";
import { FinalCtaSection } from "@/components/marketing/final-cta-section";
import { HeroSection } from "@/components/marketing/hero-section";
import { InsightFlowSection } from "@/components/marketing/insight-flow-section";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { MarketingHeader } from "@/components/marketing/marketing-header";
import { MultiTenantSection } from "@/components/marketing/multi-tenant-section";
import { OrganizationLifecycleSection } from "@/components/marketing/organization-lifecycle-section";
import { OrganizationManagementSection } from "@/components/marketing/organization-management-section";
import { ProductCapabilitiesSection } from "@/components/marketing/product-capabilities-section";
import { RolesPermissionsSection } from "@/components/marketing/roles-permissions-section";
import { TrustSection } from "@/components/marketing/trust-section";
import { ValuePropsSection } from "@/components/marketing/value-props-section";
import { WhoIsThisForSection } from "@/components/marketing/who-is-this-for-section";
import { getCurrentUser } from "@/lib/auth/context";

export const metadata: Metadata = {
  title: "Multi-Tenant Customer Feedback Platform",
  description:
    "SignalBoard is a multi-tenant SaaS platform where organizations create their own isolated workspace, launch a branded customer feedback portal, and turn customer feedback into product decisions.",
};

export default async function Home() {
  const isAuthenticated = await getCurrentUser()
    .then(() => true)
    .catch(() => false);

  // Phase 5: this primary CTA is always the organization/workspace front
  // door (/dashboard once signed in, /signup otherwise) -- never a
  // customer-portal route. The separate "Explore Customer Portal" /
  // "Access Customer Portal" CTAs throughout this page always point at
  // /feedback regardless of this internal auth state (see HeroSection,
  // CustomerJourneySection) -- an internal user's own session here must
  // never be treated as customer-portal eligibility, and a customer
  // visiting "/" must never be routed toward /dashboard.
  const primaryHref = isAuthenticated ? "/dashboard" : "/signup";
  const primaryLabel = isAuthenticated ? "Go to dashboard" : "Create your organization";

  return (
    <div className="flex min-h-svh w-full flex-col">
      <MarketingHeader isAuthenticated={isAuthenticated} />
      <main className="flex-1">
        <HeroSection primaryHref={primaryHref} primaryLabel={primaryLabel} />
        <WhoIsThisForSection />
        <ValuePropsSection />
        <OrganizationLifecycleSection />
        <MultiTenantSection />
        <OrganizationManagementSection />
        <RolesPermissionsSection />
        <CustomerJourneySection />
        <CustomerExperienceSection />
        <InsightFlowSection />
        <ProductCapabilitiesSection />
        <TrustSection />
        <FinalCtaSection primaryHref={primaryHref} primaryLabel={primaryLabel} />
      </main>
      <MarketingFooter />
    </div>
  );
}

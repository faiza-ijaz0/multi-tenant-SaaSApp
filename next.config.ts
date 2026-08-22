import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Phase 15: /dashboard/members was renamed to /dashboard/role-management.
  // Phase 17: /dashboard/settings (the organization-info landing page) was
  // renamed to /dashboard/settings/organization -- note the source is the
  // exact bare path only, so /dashboard/settings/portal (a separate,
  // unaffected route) is never touched by this rule.
  // (components/layout/dashboard-nav-items.ts). Permanent redirects so any
  // existing bookmark/link to an old path still lands somewhere real,
  // rather than 404ing -- the route-level auth/permission guard on the new
  // page is unchanged and re-runs exactly as before after the redirect.
  async redirects() {
    return [
      {
        source: "/dashboard/members",
        destination: "/dashboard/role-management",
        permanent: true,
      },
      {
        source: "/dashboard/settings",
        destination: "/dashboard/settings/organization",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;

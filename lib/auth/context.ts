import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";

import { resolveOrganizationContext } from "./organization";
import { getSelectedOrganizationId } from "./selected-organization";
import type { AuthenticatedUserContext, OrganizationContext } from "./types";
import { getAuthenticatedUser } from "./user";

/**
 * Next.js-specific entry points for Server Components/Actions/Route
 * Handlers. Thin glue only -- all the actual identity/authorization logic
 * lives in user.ts/organization.ts, which take a plain SupabaseClient and
 * are exercised directly (and testably) with real Supabase sessions in
 * tests/integration/tenant-context/.
 *
 * cache()-memoized so multiple Server Components in the same render pass
 * share one resolution instead of re-querying per component.
 */

export const getCurrentUser = cache(async (): Promise<AuthenticatedUserContext> => {
  const supabase = await createClient();
  return getAuthenticatedUser(supabase);
});

export interface TenantScope {
  supabase: SupabaseClient;
  user: AuthenticatedUserContext;
  organization: OrganizationContext["organization"];
  membership: OrganizationContext["membership"];
}

/**
 * The starting point for any organization-scoped query: authenticates,
 * resolves the caller's real organization context (from the selected-org
 * cookie, re-validated against actual membership -- never trusted as-is),
 * and hands back the same authenticated client plus that context so a
 * caller can immediately scope queries by `organization.id`. RLS remains
 * the actual authorization boundary underneath every query made with the
 * returned client -- this only removes the need for every feature to
 * re-implement "authenticate, then resolve my organization" by hand.
 *
 * Keep this the *only* place that assembles a tenant scope -- extend it
 * rather than building a parallel resolver for a specific feature.
 */
export const getTenantScope = cache(async (): Promise<TenantScope> => {
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);
  const selectedOrganizationId = await getSelectedOrganizationId();
  const context = await resolveOrganizationContext(supabase, user.id, selectedOrganizationId);
  return { supabase, user, organization: context.organization, membership: context.membership };
});

export const getCurrentOrganizationContext = cache(
  async (): Promise<OrganizationContext> => {
    const { organization, membership } = await getTenantScope();
    return { organization, membership };
  },
);

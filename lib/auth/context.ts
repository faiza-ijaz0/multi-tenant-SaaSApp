import { cache } from "react";

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

export const getCurrentOrganizationContext = cache(
  async (): Promise<OrganizationContext> => {
    const supabase = await createClient();
    const user = await getAuthenticatedUser(supabase);
    const selectedOrganizationId = await getSelectedOrganizationId();
    return resolveOrganizationContext(supabase, user.id, selectedOrganizationId);
  },
);

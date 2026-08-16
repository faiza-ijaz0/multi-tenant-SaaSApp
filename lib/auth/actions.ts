"use server";

import { cookies } from "next/headers";

import { createClient } from "@/lib/supabase/server";

import { getAuthenticatedUser } from "./user";
import { resolveOrganizationContext } from "./organization";
import { SELECTED_ORGANIZATION_COOKIE } from "./selected-organization";

/**
 * The only supported way to switch the active organization. Validates the
 * requested id against the authenticated user's real memberships via the
 * same resolver every read uses -- an organization the caller doesn't
 * belong to is rejected here and the cookie is never written, so a
 * forged/guessed id can't get further than this check.
 */
export async function selectOrganization(organizationId: string): Promise<void> {
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);

  // Throws (OrganizationAccessDeniedError / InvalidOrganizationContextError)
  // if the user doesn't actually belong to this organization.
  await resolveOrganizationContext(supabase, user.id, organizationId);

  const cookieStore = await cookies();
  cookieStore.set(SELECTED_ORGANIZATION_COOKIE, organizationId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
}

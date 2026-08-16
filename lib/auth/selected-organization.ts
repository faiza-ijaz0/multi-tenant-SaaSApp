import { cookies } from "next/headers";

/**
 * Which organization the user last switched to. Never trusted as proof of
 * access on its own -- every read of this value is re-validated against the
 * caller's real memberships by resolveOrganizationContext (organization.ts)
 * before it's used for anything. Tampering with this cookie can select a
 * different (but still owned) organization at worst, and gets rejected
 * outright at best -- it can never grant access to an organization the
 * signed-in user isn't actually a member of.
 */
export const SELECTED_ORGANIZATION_COOKIE = "sb-selected-organization-id";

export async function getSelectedOrganizationId(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(SELECTED_ORGANIZATION_COOKIE)?.value ?? null;
}

"use server";

import { redirect } from "next/navigation";

import { isEligibleCustomerForOrganization, NOT_A_CUSTOMER_MESSAGE } from "@/features/customers/customer-eligibility";
import { getPortalBySlug } from "@/features/portal-settings/queries";
import { SLUG_MAX_LENGTH, SLUG_MIN_LENGTH } from "@/lib/auth/slug";
import { getAuthenticatedUser } from "@/lib/auth/user";
import { createClient } from "@/lib/supabase/server";

import { type PortalEntryFormState } from "./portal-entry-form-state";

// Mirrors portal_settings_slug_format_check (0001_initial_schema.sql).
const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * Accepts either a bare slug ("acme") or a full portal link
 * ("https://app.example.com/feedback/acme", or just "/feedback/acme") and
 * extracts the slug candidate -- pure string parsing, no I/O, no
 * authorization decision. Returns null for input that can't possibly be a
 * valid slug, so the caller can short-circuit before ever touching the
 * database.
 */
function extractSlugCandidate(raw: string): string | null {
  let value = raw.trim();
  if (!value) return null;

  if (/^https?:\/\//i.test(value)) {
    try {
      value = new URL(value).pathname;
    } catch {
      // Not actually a valid URL despite the scheme prefix -- fall through
      // and let the segment-splitting below (and the format check after)
      // reject it on its own merits.
    }
  }

  const segments = value.split("/").map((segment) => segment.trim()).filter(Boolean);
  if (segments.length === 0) return null;

  const feedbackIndex = segments.indexOf("feedback");
  const candidate = feedbackIndex !== -1 ? segments[feedbackIndex + 1] : segments[segments.length - 1];
  return candidate ? candidate.toLowerCase() : null;
}

/**
 * Resolves a customer-supplied portal link/slug to a real organization's
 * portal, server-side only. `organization_id` is never accepted from the
 * client here -- this only ever forwards a *slug*, which
 * getPortalBySlug/portal_settings_select_member_or_public re-resolves and
 * re-authorizes from scratch against the database, exactly like the
 * existing /feedback/[slug] page itself already does. An unresolvable slug
 * (doesn't exist, or exists but this caller has no access to it) and a
 * genuinely malformed slug get the identical generic error message --
 * the same anti-enumeration posture getPortalBySlug's own doc comment
 * describes, so this form can never be used to probe which portal slugs
 * are real.
 *
 * Requires an authenticated session (this is reached only from the
 * post-auth /feedback/portal page, itself gated in its Server Component) --
 * re-checked here too since a Server Action is its own trust boundary.
 */
export async function resolvePortalEntry(
  _prevState: PortalEntryFormState,
  formData: FormData,
): Promise<PortalEntryFormState> {
  const raw = String(formData.get("portalInput") ?? "");
  const genericError = "We couldn't find a portal at that link. Check the link and try again.";

  const supabase = await createClient();
  let user;
  try {
    user = await getAuthenticatedUser(supabase);
  } catch {
    return { status: "error", message: "Sign in to open a feedback portal." };
  }

  const slug = extractSlugCandidate(raw);
  if (!slug || slug.length < SLUG_MIN_LENGTH || slug.length > SLUG_MAX_LENGTH || !SLUG_PATTERN.test(slug)) {
    return { status: "error", message: genericError };
  }

  const portal = await getPortalBySlug(supabase, slug);
  if (!portal) {
    return { status: "error", message: genericError };
  }

  // Phase 4: this is the same "is this account actually a customer here"
  // check customerLogin runs at sign-in time -- repeated here because a
  // customer can reach this form already signed in with no specific target
  // yet (the generic /feedback/portal connect flow), so login time alone
  // can't have checked this particular organization. An internal
  // owner/admin/member of this exact org (with no real customer
  // relationship here) is rejected with the same generic, non-revealing
  // message -- deliberately NOT signed out here (unlike customerLogin):
  // this is a mid-session "wrong portal for this account" rejection, not a
  // failed login, and signing them out would also discard whatever
  // legitimate customer session they may already have with a *different*
  // organization.
  const eligible = await isEligibleCustomerForOrganization(supabase, user.id, portal.organizationId);
  if (!eligible) {
    return { status: "error", message: NOT_A_CUSTOMER_MESSAGE };
  }

  redirect(`/feedback/${slug}`);
}

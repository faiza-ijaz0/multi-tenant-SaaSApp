"use server";

import { redirect } from "next/navigation";

import { isEligibleCustomerForOrganization, NOT_A_CUSTOMER_MESSAGE } from "@/features/customers/customer-eligibility";
import { getPortalBySlug } from "@/features/portal-settings/queries";
import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedUser } from "@/lib/auth/user";

import { getOrigin, isValidEmail, toUserFacingAuthError } from "./auth-helpers";
import { MIN_PASSWORD_LENGTH } from "./auth-form-state";
import {
  CUSTOMER_ENTRY_PATH,
  MAX_FULL_NAME_LENGTH,
  sanitizeCustomerNextPath,
  type CustomerAuthFormState,
} from "./customer-auth-form-state";

/**
 * Reuses the exact same supabase.auth.signUp/signInWithPassword calls as
 * the internal member flow (lib/auth/auth-actions.ts) -- this is a second
 * front door onto the same authentication system, not a second
 * authentication system. CUSTOMER_ENTRY_PATH/sanitizeCustomerNextPath live
 * in customer-auth-form-state.ts (a plain module) rather than here, since
 * every export of a "use server" file must itself be an async function.
 */

export async function customerSignup(
  _prevState: CustomerAuthFormState,
  formData: FormData,
): Promise<CustomerAuthFormState> {
  const fullName = String(formData.get("fullName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  const fieldErrors: CustomerAuthFormState["fieldErrors"] = {};
  if (!fullName) {
    fieldErrors.fullName = "Enter your full name.";
  } else if (fullName.length > MAX_FULL_NAME_LENGTH) {
    fieldErrors.fullName = `Keep it under ${MAX_FULL_NAME_LENGTH} characters.`;
  }
  if (!isValidEmail(email)) fieldErrors.email = "Enter a valid email address.";
  if (password.length < MIN_PASSWORD_LENGTH) {
    fieldErrors.password = `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (confirmPassword !== password) fieldErrors.confirmPassword = "Passwords don't match.";
  if (Object.keys(fieldErrors).length > 0) {
    return { status: "error", fieldErrors };
  }

  const origin = await getOrigin();
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // Stored in auth.users.raw_user_meta_data immediately, independent of
      // whether email confirmation gates the session -- this is what lets
      // ensureCustomerOfOrganization backfill profiles.full_name (via
      // AuthenticatedUserContext.fullName) the first time this customer's
      // JWT is read, even across a confirm-link gap where no session (and
      // therefore no authenticated write) exists yet.
      data: { full_name: fullName },
      emailRedirectTo: `${origin}/auth/confirm?next=${CUSTOMER_ENTRY_PATH}`,
    },
  });

  if (error) {
    return { status: "error", message: toUserFacingAuthError(error) };
  }

  // Same signal as the member signup flow (auth-actions.ts's signup()):
  // data.user without data.session means email confirmation is required.
  if (data.user && !data.session) {
    return {
      status: "success",
      message:
        "Check your inbox -- we've sent a confirmation link. Verify your email, then sign in to open your feedback portal.",
    };
  }

  redirect(CUSTOMER_ENTRY_PATH);
}

// The non-slug static segments under /feedback -- see app/feedback/(routes).
// A `next` landing on one of these targets no specific organization yet, so
// there's nothing to check eligibility against at login time (see
// customerLogin's own comment on why that's still safe).
const RESERVED_FEEDBACK_SEGMENTS = new Set(["sign-in", "sign-up", "portal"]);

/**
 * Pulls a portal slug out of a same-origin `next` path like
 * `/feedback/acme` or `/feedback/acme/some-submission-id`, or null when
 * `next` doesn't target a specific organization's portal at all (e.g. the
 * generic /feedback/portal connect page, or /feedback itself).
 */
function extractTargetSlug(next: string): string | null {
  const match = /^\/feedback\/([^/]+)/.exec(next);
  const candidate = match?.[1];
  if (!candidate || RESERVED_FEEDBACK_SEGMENTS.has(candidate)) return null;
  return candidate;
}

/**
 * Phase 4 security fix: a successful Supabase Auth sign-in is necessary but
 * not sufficient to grant customer-portal access. Before this fix, any
 * account that could authenticate at all -- including an internal
 * owner/admin/member's own login, since internal and customer accounts
 * share the exact same Supabase Auth system by design -- was redirected
 * straight into the portal with nothing checking whether they actually had
 * a real customer relationship there.
 *
 * When `next` targets a specific organization's portal, this now resolves
 * that organization (via the same RLS-gated getPortalBySlug every portal
 * page already uses -- an internal member can still resolve their own
 * org's private portal, which is exactly why this extra check is needed)
 * and verifies isEligibleCustomerForOrganization (features/customers/
 * customer-eligibility.ts: a real `customers` row for that org, or no
 * internal `memberships` row there). An ineligible account is signed back
 * out immediately -- the whole point is that this specific login attempt
 * must not leave behind a session that looks like a successful customer
 * login for that portal.
 *
 * When `next` has no specific target (the generic /feedback/portal connect
 * page, reached after a plain sign-in with no portal link yet), this check
 * is skipped -- rejecting here would incorrectly lock out someone who is a
 * legitimate customer of some *other* organization but also happens to
 * hold an internal membership somewhere else (Phase 4 spec section 3). The
 * same check runs again, scoped to whichever portal they actually pick,
 * in resolvePortalEntry (features/customers/resolve-portal-entry.ts) and
 * independently at every /feedback/[slug]/* page/action via
 * resolveCustomerIdentity -- this login-time check is a fast, friendly
 * rejection for the common case, not the only enforcement.
 */
export async function customerLogin(
  _prevState: CustomerAuthFormState,
  formData: FormData,
): Promise<CustomerAuthFormState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = sanitizeCustomerNextPath(formData.get("next"));

  const fieldErrors: CustomerAuthFormState["fieldErrors"] = {};
  if (!isValidEmail(email)) fieldErrors.email = "Enter a valid email address.";
  if (!password) fieldErrors.password = "Enter your password.";
  if (Object.keys(fieldErrors).length > 0) {
    return { status: "error", fieldErrors };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return { status: "error", message: toUserFacingAuthError(error) };
  }

  const targetSlug = extractTargetSlug(next);
  if (targetSlug) {
    const portal = await getPortalBySlug(supabase, targetSlug);
    if (portal) {
      const user = await getAuthenticatedUser(supabase);
      const eligible = await isEligibleCustomerForOrganization(supabase, user.id, portal.organizationId);
      if (!eligible) {
        await supabase.auth.signOut();
        return { status: "error", message: NOT_A_CUSTOMER_MESSAGE };
      }
    }
    // portal === null here just means an invalid/private-and-unrelated slug --
    // let the normal page-level notFound() handle that after redirect,
    // exactly as it already does today; not this action's job to distinguish
    // "bad slug" from "no target" cases.
  }

  redirect(next);
}

/**
 * A distinctly-branded sign-out for the customer journey, landing back on
 * /feedback/sign-in rather than /login -- functionally the same
 * supabase.auth.signOut() call as lib/auth/auth-actions.ts's signOut(),
 * kept separate (not parameterized) because that action is already bound
 * with no arguments from the dashboard topbar's onClick handler.
 */
export async function customerSignOut(): Promise<void> {
  const supabase = await createClient();
  try {
    await supabase.auth.signOut();
  } catch (error) {
    console.error("customerSignOut: supabase.auth.signOut() failed:", error);
  }
  redirect("/feedback/sign-in");
}

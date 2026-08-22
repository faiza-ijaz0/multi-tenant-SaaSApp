"use server";

import { redirect } from "next/navigation";

import {
  isAccessibleDashboardPath,
  resolveFirstAccessiblePath,
} from "@/components/layout/dashboard-nav-items";
import { createClient } from "@/lib/supabase/server";
import { getEffectivePermissions, hasPage } from "@/lib/authorization/permissions";
import type { PageKey } from "@/lib/authorization/registry";

import { getTenantScope } from "./context";
import { getOrigin, isValidEmail, toUserFacingAuthError } from "./auth-helpers";
import {
  MIN_PASSWORD_LENGTH,
  sanitizeNextPath,
  type AuthFormState,
} from "./auth-form-state";

/**
 * Picks where a just-signed-in user actually lands, instead of blindly
 * trusting `requestedNext` (which defaults to /dashboard whenever the
 * caller didn't arrive via a specific protected-route bounce -- see
 * sanitizeNextPath). An owner, or anyone else who genuinely holds the
 * Dashboard page permission, keeps requestedNext exactly as before
 * (isAccessibleDashboardPath is true for every /dashboard* path once
 * getEffectivePermissions().isOwner bypasses hasPage() unconditionally).
 * Anyone without access to that specific target instead lands on the first
 * page their real, server-resolved effective permissions actually grant
 * (dashboardNavItems' canonical order), reusing the exact same
 * getTenantScope()/getEffectivePermissions()/hasPage() pipeline every
 * dashboard route guard already uses -- never a second, parallel
 * permission system, and never anything derived from client input.
 *
 * Only /dashboard and its sub-routes are ever second-guessed here --
 * non-dashboard next targets (e.g. /onboarding, reached the same way after
 * a protected-route bounce) are returned unchanged, exactly like before
 * this function existed.
 */
async function resolvePostLoginRedirect(requestedNext: string): Promise<string> {
  if (requestedNext !== "/dashboard" && !requestedNext.startsWith("/dashboard/")) {
    return requestedNext;
  }

  let scope;
  try {
    scope = await getTenantScope();
  } catch {
    // No organization yet, access denied, or any other resolution failure --
    // preserve the pre-existing behavior for these (e.g. /dashboard's own
    // "create an organization" empty state already handles the no-org case).
    return requestedNext;
  }

  const permissions = await getEffectivePermissions(scope);
  const isPageAllowed = (page: PageKey) => hasPage(permissions, page);

  if (isAccessibleDashboardPath(requestedNext, isPageAllowed)) {
    return requestedNext;
  }

  return resolveFirstAccessiblePath(isPageAllowed) ?? "/dashboard/no-access";
}

export async function login(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = sanitizeNextPath(formData.get("next"));

  const fieldErrors: AuthFormState["fieldErrors"] = {};
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

  redirect(await resolvePostLoginRedirect(next));
}

export async function signup(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  const fieldErrors: AuthFormState["fieldErrors"] = {};
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
    options: { emailRedirectTo: `${origin}/auth/confirm?next=/dashboard` },
  });

  if (error) {
    return { status: "error", message: toUserFacingAuthError(error) };
  }

  // No session back means email confirmation is required (this project has
  // it enabled) -- data.user without data.session is Supabase's documented
  // signal for that, not an error.
  if (data.user && !data.session) {
    return {
      status: "success",
      message:
        "Check your inbox -- we've sent a confirmation link. Verify your email before signing in.",
    };
  }

  redirect("/dashboard");
}

export async function requestPasswordReset(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!isValidEmail(email)) {
    return { status: "error", fieldErrors: { email: "Enter a valid email address." } };
  }

  const origin = await getOrigin();
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/confirm?next=/reset-password`,
  });

  // Rate limiting is worth surfacing distinctly; anything else still
  // returns the same generic success message below, so the response never
  // reveals whether that address has an account -- a standard password
  // reset security practice.
  if (error) {
    if (error.code === "over_email_send_rate_limit" || error.code === "over_request_rate_limit") {
      return { status: "error", message: "Too many requests. Please wait a moment and try again." };
    }
    console.error("resetPasswordForEmail failed:", error.code ?? error.name, error.message);
  }

  return {
    status: "success",
    message: "If an account exists for that email, we've sent a password reset link.",
  };
}

export async function updatePassword(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  const fieldErrors: AuthFormState["fieldErrors"] = {};
  if (password.length < MIN_PASSWORD_LENGTH) {
    fieldErrors.password = `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (confirmPassword !== password) fieldErrors.confirmPassword = "Passwords don't match.";
  if (Object.keys(fieldErrors).length > 0) {
    return { status: "error", fieldErrors };
  }

  const supabase = await createClient();

  // Requires the temporary recovery session /auth/confirm established from
  // the emailed link. If that session is missing or has expired, this
  // fails safely (an auth error) rather than updating the wrong account.
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    return { status: "error", message: toUserFacingAuthError(error) };
  }

  redirect("/dashboard");
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  try {
    await supabase.auth.signOut();
  } catch (error) {
    // supabase.auth.signOut() normally resolves with an { error } field
    // rather than throwing -- this only catches a genuine lower-level
    // failure (e.g. the underlying fetch itself rejecting). Redirecting to
    // /login regardless is deliberate: it's the safest outcome for a
    // sign-out action either way (the local session cookies are cleared by
    // the client before any remote call, so there is no "authenticated but
    // stuck" state to protect by staying put), and it avoids leaving the
    // user on an unhandled-rejection error page for what they experience
    // as a successful sign-out.
    console.error("supabase.auth.signOut() failed:", error);
  }
  redirect("/login");
}

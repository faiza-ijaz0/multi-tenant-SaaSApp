"use server";

import type { AuthError } from "@supabase/supabase-js";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

import {
  MIN_PASSWORD_LENGTH,
  sanitizeNextPath,
  type AuthFormState,
} from "./auth-form-state";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value);
}

async function getOrigin(): Promise<string> {
  const headersList = await headers();
  const host = headersList.get("x-forwarded-host") ?? headersList.get("host") ?? "localhost:3000";
  const protocol = headersList.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${protocol}://${host}`;
}

/**
 * Maps a Supabase Auth error to safe, actionable copy. Never returns
 * error.message directly -- that's logged server-side for us to see, not
 * shown to the client.
 */
function toUserFacingAuthError(error: AuthError): string {
  console.error("Supabase auth error:", error.code ?? error.name, error.message);

  switch (error.code) {
    case "invalid_credentials":
      return "Incorrect email or password.";
    case "email_not_confirmed":
      return "Please confirm your email address before signing in.";
    case "user_already_exists":
      return "An account with this email already exists. Try signing in instead.";
    case "weak_password":
      return `Password is too weak. Use at least ${MIN_PASSWORD_LENGTH} characters.`;
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
      return "Too many requests. Please wait a moment and try again.";
    case "same_password":
      return "New password must be different from your current password.";
    default:
      return "Something went wrong. Please try again.";
  }
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

  redirect(next);
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
  await supabase.auth.signOut();
  redirect("/login");
}

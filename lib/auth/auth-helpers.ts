import type { AuthError } from "@supabase/supabase-js";
import { headers } from "next/headers";

import { MIN_PASSWORD_LENGTH } from "./auth-form-state";

/**
 * Shared, plain (non-"use server") helpers for both the internal member
 * auth actions (auth-actions.ts) and the customer auth actions
 * (customer-auth-actions.ts) -- kept in their own module because every
 * export of a "use server" file must itself be an async function, so
 * neither of those two files can export a sync helper like isValidEmail
 * for the other to import.
 */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value);
}

export async function getOrigin(): Promise<string> {
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
export function toUserFacingAuthError(error: AuthError): string {
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

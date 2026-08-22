import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { sanitizeNextPath } from "@/lib/auth/auth-form-state";

/**
 * Exchanges an emailed confirmation/recovery link for a real session. This
 * must be a Route Handler, not a Server Component page -- only a Route
 * Handler (or Server Action) can write the session cookie.
 *
 * Supports both link shapes a Supabase project can be configured to send:
 *   - token_hash + type (the current recommended SSR template, verified
 *     locally via verifyOtp)
 *   - code (the default template's PKCE redirect, already token-verified
 *     by Supabase's own /auth/v1/verify before reaching us -- exchanged
 *     via exchangeCodeForSession)
 * Which one arrives depends on this project's Auth email template
 * configuration, which lives in the Supabase Dashboard, not in this repo.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");
  const next = sanitizeNextPath(searchParams.get("next"));

  const redirectTo = request.nextUrl.clone();
  redirectTo.search = "";
  const supabase = await createClient();

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      redirectTo.pathname = next;
      return NextResponse.redirect(redirectTo);
    }
    console.error("verifyOtp failed:", error.code ?? error.name, error.message);
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      redirectTo.pathname = next;
      return NextResponse.redirect(redirectTo);
    }
    console.error("exchangeCodeForSession failed:", error.code ?? error.name, error.message);
  }

  // Invalid, expired, or already-used link. A /feedback next target means
  // this was the customer signup/reset flow (see lib/auth/
  // customer-auth-actions.ts) -- send it back to the customer-facing sign-in,
  // never the internal /login, so a customer never lands on admin-branded
  // chrome.
  redirectTo.pathname =
    next === "/reset-password" ? "/reset-password" : next.startsWith("/feedback") ? "/feedback/sign-in" : "/login";
  redirectTo.searchParams.set("error", "invalid_link");
  return NextResponse.redirect(redirectTo);
}

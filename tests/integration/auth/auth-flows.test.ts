import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { getAuthenticatedUser } from "@/lib/auth/user";
import { UnauthenticatedError } from "@/lib/auth/errors";

import {
  anonClient,
  createTestIdentity,
  deleteTestIdentity,
  signInAs,
  type TestIdentity,
} from "../rls/helpers";

// Real runtime verification of the Supabase Auth mechanisms Phase 3's
// Server Actions wrap (lib/auth/auth-actions.ts). The Server Actions
// themselves can't be invoked outside the Next.js request runtime --
// redirect()/cookies()/headers() all require it, same reasoning Phase 2
// applied to lib/auth/context.ts. What's exercised here is the real
// Supabase Auth call underneath each action -- signInWithPassword, signUp,
// signOut, resetPasswordForEmail -- through genuine sessions, never
// simulated request.jwt.claims.
//
// "Unauthenticated protected-route behavior" (proxy.ts redirecting
// /dashboard/* to /login) is optimistic routing logic built on exactly the
// getAuthenticatedUser() rejection already verified in
// tests/integration/tenant-context/context.test.ts; it isn't re-tested at
// the HTTP/proxy level here -- that would need a running Next.js server,
// which is out of scope for this Supabase-focused integration harness (see
// the Known Limitations note in the Phase 3 report).

let identity: TestIdentity;

beforeAll(async () => {
  identity = await createTestIdentity("auth-flow-user");
}, 30_000);

afterAll(async () => {
  if (identity) await deleteTestIdentity(identity.id);
}, 30_000);

describe("login", () => {
  it("succeeds with correct credentials and resolves a real authenticated session", async () => {
    const client = anonClient();
    const { data, error } = await client.auth.signInWithPassword({
      email: identity.email,
      password: identity.password,
    });
    expect(error).toBeNull();
    expect(data.session).not.toBeNull();

    const user = await getAuthenticatedUser(client);
    expect(user.id).toBe(identity.id);
    expect(user.email).toBe(identity.email);
  });

  it("fails with an incorrect password and returns no session", async () => {
    const client = anonClient();
    const { data, error } = await client.auth.signInWithPassword({
      email: identity.email,
      password: "definitely-the-wrong-password",
    });
    expect(error).not.toBeNull();
    expect(data.session).toBeNull();
  });

  it("rejects an unauthenticated client the same way a protected route would", async () => {
    await expect(getAuthenticatedUser(anonClient())).rejects.toBeInstanceOf(UnauthenticatedError);
  });
});

describe("sign-out", () => {
  it("clears the session so the same client is no longer authenticated afterward", async () => {
    const client = await signInAs(identity);
    await expect(getAuthenticatedUser(client)).resolves.toMatchObject({ id: identity.id });

    const { error } = await client.auth.signOut();
    expect(error).toBeNull();

    await expect(getAuthenticatedUser(client)).rejects.toBeInstanceOf(UnauthenticatedError);
  });
});

describe("signup", () => {
  it("behaves per this project's email-confirmation configuration", async () => {
    const client = anonClient();
    // Not @example.com: Supabase's self-serve signUp() applies stricter
    // email validation than the Admin API path (createTestIdentity, used
    // everywhere else in this suite) and rejects that domain outright as
    // email_address_invalid -- confirmed via direct probe in Phase 1A.
    // gmail.com passes that validation (reaches the actual send attempt).
    const email = `auth-flow-signup-${randomUUID()}@gmail.com`;
    const password = `${randomUUID()}${randomUUID()}`;

    const { data, error } = await client.auth.signUp({ email, password });

    // This project has email confirmation enabled (established in Phase
    // 1A) and a low email-send rate limit -- a real send attempt here can
    // legitimately hit that limit rather than the normal
    // confirmation-required response. Both outcomes prove the same thing
    // (no immediate session is ever handed out on signup); only an
    // unexpected error, or an immediate session, is a real failure.
    if (error) {
      expect(error.code).toBe("over_email_send_rate_limit");
    } else {
      expect(data.user).not.toBeNull();
      expect(data.session).toBeNull();
    }

    if (data.user) {
      await deleteTestIdentity(data.user.id);
    }
  });

  it("rejects signing up with an email that already has a confirmed account", async () => {
    const client = anonClient();
    const { data, error } = await client.auth.signUp({
      email: identity.email,
      password: `${randomUUID()}${randomUUID()}`,
    });

    // Supabase either errors outright (user_already_exists) or -- to avoid
    // account enumeration on some configurations -- returns an obfuscated
    // "success" with no new session and no new user id. Either way, it
    // must never silently create a second, real session for an email that
    // already belongs to someone else.
    if (error) {
      expect(error.code).toBe("user_already_exists");
    } else {
      expect(data.session).toBeNull();
    }
  });
});

describe("password reset", () => {
  it("accepts a reset request for a real account without leaking internal errors", async () => {
    const { error } = await anonClient().auth.resetPasswordForEmail(identity.email);
    // Same rate-limit caveat as signup -- a real email send attempt is
    // involved here too.
    if (error) {
      expect(error.code).toBe("over_email_send_rate_limit");
    } else {
      expect(error).toBeNull();
    }
  });

  it("returns the same shape for a non-existent email (no account enumeration)", async () => {
    const { error } = await anonClient().auth.resetPasswordForEmail(
      `no-such-account-${randomUUID()}@example.com`,
    );
    if (error) {
      expect(error.code).toBe("over_email_send_rate_limit");
    } else {
      expect(error).toBeNull();
    }
  });
});

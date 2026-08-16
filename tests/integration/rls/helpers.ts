import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !anonKey || !serviceRoleKey) {
  throw new Error(
    "RLS integration tests require NEXT_PUBLIC_SUPABASE_URL and " +
      "NEXT_PUBLIC_SUPABASE_ANON_KEY (from .env.local) plus " +
      "SUPABASE_SERVICE_ROLE_KEY (from .env.test.local, test-only, gitignored). " +
      "See tests/integration/README.md.",
  );
}

const SUPABASE_URL = url;
const ANON_KEY = anonKey;
const SERVICE_ROLE_KEY = serviceRoleKey;

const clientOptions = {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
} as const;

/** Service-role client. Test-only: creates/deletes real auth.users test identities. */
export const adminClient: SupabaseClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, clientOptions);

/** Fresh anon-key client with no session — for genuine anonymous-access tests. */
export function anonClient(): SupabaseClient {
  return createClient(SUPABASE_URL, ANON_KEY, clientOptions);
}

export interface TestIdentity {
  id: string;
  email: string;
  password: string;
}

/**
 * Creates a real, pre-confirmed auth.users row via the Auth Admin API.
 * Admin API is required (not self-serve signup) because this project has
 * email confirmation enabled — self-serve signup can't produce a usable
 * session without a real inbox.
 */
export async function createTestIdentity(label: string): Promise<TestIdentity> {
  const email = `rls-test-${label}-${randomUUID()}@example.com`;
  const password = `${randomUUID()}${randomUUID()}`;
  const { data, error } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) {
    throw new Error(`Failed to create test identity "${label}": ${error?.message ?? "no user returned"}`);
  }
  return { id: data.user.id, email, password };
}

/** Signs in through the real Supabase Auth password grant -- a genuine JWT session. */
export async function signInAs(identity: TestIdentity): Promise<SupabaseClient> {
  const client = anonClient();
  const { error } = await client.auth.signInWithPassword({
    email: identity.email,
    password: identity.password,
  });
  if (error) {
    throw new Error(`Failed to sign in test identity ${identity.email}: ${error.message}`);
  }
  return client;
}

export async function deleteTestIdentity(userId: string): Promise<void> {
  const { error } = await adminClient.auth.admin.deleteUser(userId);
  if (error) {
    // Cleanup best-effort: report but don't fail the suite over a leftover test user.
    console.error(`Failed to delete test identity ${userId}: ${error.message}`);
  }
}

/** True if a query result represents RLS denial: an error, or a silently empty/filtered result. */
export function isDenied(result: { data: unknown; error: { code?: string } | null }): boolean {
  if (result.error) return true;
  if (Array.isArray(result.data)) return result.data.length === 0;
  return result.data === null;
}

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminClient, createTestIdentity, deleteTestIdentity, signInAs, type TestIdentity } from "./helpers";

/**
 * Two isolated test organizations ("RLS Test Organization A/B") with one
 * owner and one customer identity each, built entirely through real
 * authenticated sessions calling the actual insert policies (bootstrap
 * membership, self-service profile/customer rows) -- not admin bypass.
 * Org A's portal is public; Org B's is private, so the suite can assert
 * both "public data is reachable" and "private data stays private" against
 * real fixtures.
 */
export interface RlsFixtures {
  orgA: { id: string; slug: string };
  orgB: { id: string; slug: string };
  ownerA: TestIdentity;
  ownerB: TestIdentity;
  customerA: TestIdentity;
  customerB: TestIdentity;
  clientOwnerA: SupabaseClient;
  clientOwnerB: SupabaseClient;
  clientCustomerA: SupabaseClient;
  clientCustomerB: SupabaseClient;
  statusA: string;
  categoryA: string;
  submissionA: string;
  statusB: string;
  categoryB: string;
  submissionB: string;
  publicCommentA: string;
  internalCommentA: string;
  publicCommentB: string;
}

function shortSlugSuffix(): string {
  return randomUUID().replace(/-/g, "").slice(0, 8);
}

async function must(label: string, promise: PromiseLike<{ error: { message: string } | null }>) {
  const { error } = await promise;
  if (error) throw new Error(`Fixture setup failed at "${label}": ${error.message}`);
}

async function cleanupOrganizationsAndIdentities(
  orgIds: string[],
  identityIds: string[],
): Promise<void> {
  // Deleting the orgs cascades categories/statuses/submissions/memberships/
  // customers/portal_settings/comments/votes owned by them.
  await Promise.allSettled(orgIds.map((id) => adminClient.from("organizations").delete().eq("id", id)));
  // Deleting the auth.users rows cascades their profiles rows.
  await Promise.allSettled(identityIds.map(deleteTestIdentity));
}

/**
 * Creates the fixtures, tracking every identity/org id as soon as it exists
 * (before the call that might fail on the *next* one) so that a failure
 * partway through -- e.g. a transient network error -- cleans up whatever
 * was already created instead of leaking it. Deleting an id that was never
 * actually inserted (e.g. an org whose own insert is what failed) is a
 * harmless no-op delete.
 */
export async function setupFixtures(): Promise<RlsFixtures> {
  const identityIds: string[] = [];
  const orgIds: string[] = [];

  try {
    return await buildFixtures(identityIds, orgIds);
  } catch (error) {
    await cleanupOrganizationsAndIdentities(orgIds, identityIds);
    throw error;
  }
}

async function buildFixtures(identityIds: string[], orgIds: string[]): Promise<RlsFixtures> {
  const [ownerA, ownerB, customerA, customerB] = await Promise.all([
    createTestIdentity("org-a-owner"),
    createTestIdentity("org-b-owner"),
    createTestIdentity("org-a-customer"),
    createTestIdentity("org-b-customer"),
  ]);
  identityIds.push(ownerA.id, ownerB.id, customerA.id, customerB.id);

  const [clientOwnerA, clientOwnerB, clientCustomerA, clientCustomerB] = await Promise.all([
    signInAs(ownerA),
    signInAs(ownerB),
    signInAs(customerA),
    signInAs(customerB),
  ]);

  // Real profiles_insert_own exercise: every identity creates its own profile row.
  await must("profile A owner", clientOwnerA.from("profiles").insert({ id: ownerA.id }));
  await must("profile B owner", clientOwnerB.from("profiles").insert({ id: ownerB.id }));
  await must("profile A customer", clientCustomerA.from("profiles").insert({ id: customerA.id }));
  await must("profile B customer", clientCustomerB.from("profiles").insert({ id: customerB.id }));

  const orgA = { id: randomUUID(), slug: `rls-test-a-${shortSlugSuffix()}` };
  const orgB = { id: randomUUID(), slug: `rls-test-b-${shortSlugSuffix()}` };
  orgIds.push(orgA.id, orgB.id);

  // Real organizations_insert_authenticated exercise.
  await must(
    "org A create",
    clientOwnerA.from("organizations").insert({ id: orgA.id, name: "RLS Test Organization A" }),
  );
  await must(
    "org B create",
    clientOwnerB.from("organizations").insert({ id: orgB.id, name: "RLS Test Organization B" }),
  );

  // Real memberships_insert_bootstrap_owner exercise.
  await must(
    "org A bootstrap owner membership",
    clientOwnerA
      .from("memberships")
      .insert({ id: randomUUID(), organization_id: orgA.id, profile_id: ownerA.id, role: "owner" }),
  );
  await must(
    "org B bootstrap owner membership",
    clientOwnerB
      .from("memberships")
      .insert({ id: randomUUID(), organization_id: orgB.id, profile_id: ownerB.id, role: "owner" }),
  );

  // Real customers_insert_self_or_admin exercise (self branch).
  await must(
    "org A customer self-registration",
    clientCustomerA
      .from("customers")
      .insert({ id: randomUUID(), organization_id: orgA.id, profile_id: customerA.id, email: customerA.email }),
  );
  await must(
    "org B customer self-registration",
    clientCustomerB
      .from("customers")
      .insert({ id: randomUUID(), organization_id: orgB.id, profile_id: customerB.id, email: customerB.email }),
  );

  // Org A's portal is public; Org B's is private -- deliberately different so
  // the suite can prove both "public is reachable" and "private stays private".
  await must(
    "org A portal settings",
    clientOwnerA
      .from("portal_settings")
      .insert({ id: randomUUID(), organization_id: orgA.id, slug: orgA.slug, is_public: true }),
  );
  await must(
    "org B portal settings",
    clientOwnerB
      .from("portal_settings")
      .insert({ id: randomUUID(), organization_id: orgB.id, slug: orgB.slug, is_public: false }),
  );

  const statusA = randomUUID();
  const categoryA = randomUUID();
  const submissionA = randomUUID();
  const statusB = randomUUID();
  const categoryB = randomUUID();
  const submissionB = randomUUID();

  await must("org A status", clientOwnerA.from("statuses").insert({ id: statusA, organization_id: orgA.id, name: "Open" }));
  await must(
    "org A category",
    clientOwnerA.from("categories").insert({ id: categoryA, organization_id: orgA.id, name: "General" }),
  );
  await must("org B status", clientOwnerB.from("statuses").insert({ id: statusB, organization_id: orgB.id, name: "Open" }));
  await must(
    "org B category",
    clientOwnerB.from("categories").insert({ id: categoryB, organization_id: orgB.id, name: "General" }),
  );

  await must(
    "org A submission",
    clientOwnerA.from("submissions").insert({
      id: submissionA,
      organization_id: orgA.id,
      category_id: categoryA,
      status_id: statusA,
      submitted_by: ownerA.id,
      title: "RLS test submission A",
      type: "feature",
    }),
  );
  await must(
    "org B submission",
    clientOwnerB.from("submissions").insert({
      id: submissionB,
      organization_id: orgB.id,
      category_id: categoryB,
      status_id: statusB,
      submitted_by: ownerB.id,
      title: "RLS test submission B",
      type: "feature",
    }),
  );

  const publicCommentA = randomUUID();
  const internalCommentA = randomUUID();

  await must(
    "org A public comment",
    clientOwnerA.from("comments").insert({
      id: publicCommentA,
      submission_id: submissionA,
      author_profile_id: ownerA.id,
      body: "Public comment on submission A",
      is_internal: false,
    }),
  );
  await must(
    "org A internal comment",
    clientOwnerA.from("comments").insert({
      id: internalCommentA,
      submission_id: submissionA,
      author_profile_id: ownerA.id,
      body: "Internal-only note on submission A",
      is_internal: true,
    }),
  );

  const publicCommentB = randomUUID();
  await must(
    "org B public comment",
    clientOwnerB.from("comments").insert({
      id: publicCommentB,
      submission_id: submissionB,
      author_profile_id: ownerB.id,
      body: "Public comment on submission B",
      is_internal: false,
    }),
  );

  return {
    orgA,
    orgB,
    ownerA,
    ownerB,
    customerA,
    customerB,
    clientOwnerA,
    clientOwnerB,
    clientCustomerA,
    clientCustomerB,
    statusA,
    categoryA,
    submissionA,
    statusB,
    categoryB,
    submissionB,
    publicCommentA,
    internalCommentA,
    publicCommentB,
  };
}

export async function teardownFixtures(fixtures: RlsFixtures): Promise<void> {
  await cleanupOrganizationsAndIdentities(
    [fixtures.orgA.id, fixtures.orgB.id],
    [fixtures.ownerA.id, fixtures.ownerB.id, fixtures.customerA.id, fixtures.customerB.id],
  );
}

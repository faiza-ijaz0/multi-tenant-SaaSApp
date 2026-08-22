import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { updatePortalSettingsForOrganization } from "@/features/portal-settings/actions";
import {
  DEFAULT_ACCENT_COLOR,
  validatePortalSettingsInput,
  type PortalSettingsInput,
} from "@/features/portal-settings/form-state";

import { adminClient, createTestIdentity, deleteTestIdentity, signInAs, type TestIdentity } from "../rls/helpers";

function baseInput(slug: string): PortalSettingsInput {
  return {
    slug,
    brandName: "Test Brand",
    welcomeMessage: "Welcome!",
    logoUrl: "",
    accentColor: DEFAULT_ACCENT_COLOR,
    isPublic: true,
  };
}

describe("features/portal-settings/actions.ts: validatePortalSettingsInput (pure)", () => {
  it("accepts a valid input", () => {
    expect(validatePortalSettingsInput(baseInput("valid-slug"))).toBeNull();
  });

  it("rejects a too-short slug", () => {
    const errors = validatePortalSettingsInput(baseInput("ab"));
    expect(errors?.slug).toBeDefined();
  });

  it("rejects a slug with invalid characters", () => {
    const errors = validatePortalSettingsInput(baseInput("Not Valid!"));
    expect(errors?.slug).toBeDefined();
  });

  it("rejects an invalid logo URL", () => {
    const errors = validatePortalSettingsInput({ ...baseInput("valid-slug"), logoUrl: "not-a-url" });
    expect(errors?.logoUrl).toBeDefined();
  });

  it("allows an empty logo URL", () => {
    expect(validatePortalSettingsInput(baseInput("valid-slug"))?.logoUrl).toBeUndefined();
  });
});

describe("features/portal-settings/actions.ts: updatePortalSettingsForOrganization (DB core)", () => {
  let owner: TestIdentity;
  let ownerClient: SupabaseClient;
  let orgId: string;
  let takenSlug: string;
  let takenOrgId: string;

  beforeAll(async () => {
    owner = await createTestIdentity("portal-settings-owner");
    ownerClient = await signInAs(owner);

    await ownerClient.from("profiles").insert({ id: owner.id });

    orgId = randomUUID();
    await ownerClient.from("organizations").insert({ id: orgId, name: "Portal Settings Test Org" });
    await ownerClient
      .from("memberships")
      .insert({ id: randomUUID(), organization_id: orgId, profile_id: owner.id, role: "owner" });

    // A second, disposable org (service-role-created -- no session needed for
    // this one, it only exists to occupy a slug) to prove the 23505 -> clean
    // fieldErrors mapping for a genuinely taken slug.
    takenSlug = `portal-taken-${randomUUID().replace(/-/g, "").slice(0, 8)}`;
    takenOrgId = randomUUID();
    await adminClient.from("organizations").insert({ id: takenOrgId, name: "Slug Holder Org" });
    await adminClient
      .from("portal_settings")
      .insert({ id: randomUUID(), organization_id: takenOrgId, slug: takenSlug, is_public: true });
  }, 60_000);

  afterAll(async () => {
    if (orgId) await adminClient.from("organizations").delete().eq("id", orgId);
    if (takenOrgId) await adminClient.from("organizations").delete().eq("id", takenOrgId);
    if (owner) await deleteTestIdentity(owner.id);
  }, 60_000);

  it("creates portal settings on first save (insert branch of the upsert)", async () => {
    const slug = `portal-actions-${randomUUID().replace(/-/g, "").slice(0, 8)}`;
    const result = await updatePortalSettingsForOrganization(ownerClient, orgId, baseInput(slug));
    expect(result.ok).toBe(true);

    const { data } = await adminClient
      .from("portal_settings")
      .select("slug, brand_name, is_public")
      .eq("organization_id", orgId)
      .maybeSingle();
    expect(data?.slug).toBe(slug);
    expect(data?.brand_name).toBe("Test Brand");
    expect(data?.is_public).toBe(true);
  });

  it("updates portal settings on a second save without creating a duplicate row (update branch of the upsert)", async () => {
    const slug = `portal-actions-updated-${randomUUID().replace(/-/g, "").slice(0, 8)}`;
    const result = await updatePortalSettingsForOrganization(ownerClient, orgId, {
      ...baseInput(slug),
      brandName: "Updated Brand",
    });
    expect(result.ok).toBe(true);

    const { data } = await adminClient.from("portal_settings").select("id").eq("organization_id", orgId);
    expect(data).toHaveLength(1);
    expect(data![0].id).toBeDefined();
  });

  it("maps a taken slug to a clean fieldErrors.slug message, not a raw constraint error", async () => {
    const result = await updatePortalSettingsForOrganization(ownerClient, orgId, baseInput(takenSlug));
    expect(result.ok).toBe(false);
    expect(result.fieldErrors?.slug).toMatch(/already taken/i);
  });
});

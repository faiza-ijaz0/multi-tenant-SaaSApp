"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

import { selectOrganization } from "./actions";
import {
  MAX_ORGANIZATION_NAME_LENGTH,
  type OrganizationFormState,
} from "./organization-form-state";
import { createOrganizationForUser } from "./organization";
import { getAuthenticatedUser } from "./user";

export async function createOrganization(
  _prevState: OrganizationFormState,
  formData: FormData,
): Promise<OrganizationFormState> {
  const name = String(formData.get("name") ?? "").trim();

  if (!name) {
    return { status: "error", fieldErrors: { name: "Enter an organization name." } };
  }
  if (name.length > MAX_ORGANIZATION_NAME_LENGTH) {
    return {
      status: "error",
      fieldErrors: { name: `Keep it under ${MAX_ORGANIZATION_NAME_LENGTH} characters.` },
    };
  }

  const supabase = await createClient();
  // Onboarding is only reachable while authenticated (app/onboarding/page.tsx
  // gates it), so this is defense in depth: a direct, unauthenticated POST
  // to this action throws here rather than silently doing nothing.
  const user = await getAuthenticatedUser(supabase);

  let result;
  try {
    result = await createOrganizationForUser(supabase, user.id, name);
  } catch (error) {
    console.error("createOrganizationForUser failed:", error);
    return {
      status: "error",
      message: "Something went wrong creating your organization. Please try again.",
    };
  }

  // Reuses the existing, validated org-switching mechanism instead of
  // writing the selected-organization cookie directly -- selectOrganization
  // re-resolves against the membership just created, so it can never select
  // an organization this user doesn't actually belong to.
  await selectOrganization(result.organization.id);

  redirect("/dashboard");
}

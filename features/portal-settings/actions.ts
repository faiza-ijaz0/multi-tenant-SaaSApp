"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";

import { getTenantScope } from "@/lib/auth/context";
import { requireAction } from "@/lib/authorization/permissions";

import {
  DEFAULT_ACCENT_COLOR,
  validatePortalSettingsInput,
  type PortalSettingsFieldErrors,
  type PortalSettingsFormState,
  type PortalSettingsInput,
} from "./form-state";

const PORTAL_SETTINGS_PATH = "/dashboard/settings/portal";
const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

/**
 * App-level pre-check -- portal_settings_insert_admin/_update_admin/_delete_admin
 * (extended by 0013_membership_action_permissions.sql with
 * AND has_action_permission(org, 'portal_settings:edit')) remain the actual
 * authorization boundary regardless of this check.
 */
async function requirePortalSettingsAction() {
  const scope = await getTenantScope();
  try {
    await requireAction(scope, "portal_settings:edit");
  } catch {
    throw new Error("You don't have permission to manage portal settings.");
  }
  return scope;
}

export interface UpdatePortalSettingsResult {
  ok: boolean;
  message?: string;
  fieldErrors?: PortalSettingsFieldErrors;
}

/**
 * Framework-agnostic core, same extraction pattern as
 * features/submissions/status.ts's updateSubmissionStatusForOrganization --
 * directly testable with a real Supabase session, since the "use server"
 * action wrapping this can't run outside a Next.js request (getTenantScope()
 * needs cookies()). organizationId must already be a server-resolved,
 * RLS-verified value -- never a raw client-supplied id. Input is assumed
 * already validated by validatePortalSettingsInput.
 */
export async function updatePortalSettingsForOrganization(
  supabase: SupabaseClient,
  organizationId: string,
  input: PortalSettingsInput,
): Promise<UpdatePortalSettingsResult> {
  // `id` is deliberately omitted: it has a DB default (gen_random_uuid()),
  // so leaving it out means it's only ever generated on first insert and
  // is never overwritten by the ON CONFLICT DO UPDATE path -- including it
  // here would churn the primary key on every save.
  const { error } = await supabase.from("portal_settings").upsert(
    {
      organization_id: organizationId,
      slug: input.slug,
      brand_name: input.brandName || null,
      logo_url: input.logoUrl || null,
      accent_color: input.accentColor,
      welcome_message: input.welcomeMessage || null,
      is_public: input.isPublic,
    },
    { onConflict: "organization_id" },
  );

  if (error) {
    console.error("updatePortalSettingsForOrganization failed:", error);
    if (error.code === "23505") {
      return { ok: false, fieldErrors: { slug: "That slug is already taken." } };
    }
    return { ok: false, message: "Something went wrong saving portal settings." };
  }

  return { ok: true };
}

export async function updatePortalSettings(
  _prevState: PortalSettingsFormState,
  formData: FormData,
): Promise<PortalSettingsFormState> {
  const input: PortalSettingsInput = {
    slug: String(formData.get("slug") ?? "").trim().toLowerCase(),
    brandName: String(formData.get("brandName") ?? "").trim(),
    welcomeMessage: String(formData.get("welcomeMessage") ?? "").trim(),
    logoUrl: String(formData.get("logoUrl") ?? "").trim(),
    accentColor: String(formData.get("accentColor") ?? DEFAULT_ACCENT_COLOR).trim(),
    isPublic: formData.get("isPublic") === "on",
  };

  if (!HEX_COLOR_PATTERN.test(input.accentColor)) {
    return { status: "error", message: "Invalid accent color." };
  }
  const fieldErrors = validatePortalSettingsInput(input);
  if (fieldErrors) {
    return { status: "error", fieldErrors };
  }

  let scope;
  try {
    scope = await requirePortalSettingsAction();
  } catch {
    return { status: "error", message: "You don't have permission to do that." };
  }

  const result = await updatePortalSettingsForOrganization(scope.supabase, scope.organization.id, input);
  if (!result.ok) {
    return { status: "error", message: result.message, fieldErrors: result.fieldErrors };
  }

  revalidatePath(PORTAL_SETTINGS_PATH);
  revalidatePath(`/feedback/${input.slug}`);
  return { status: "success", message: "Portal settings saved." };
}

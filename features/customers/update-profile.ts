"use server";

import { revalidatePath } from "next/cache";

import { getAuthenticatedUser } from "@/lib/auth/user";
import { createClient } from "@/lib/supabase/server";

import { MAX_CUSTOMER_NAME_LENGTH, type UpdateProfileFormState } from "./update-profile-form-state";

/**
 * The only piece of their own profile a customer can edit -- full_name.
 * profiles_update_own (0003_rls_policies.sql) permits exactly this: a
 * caller updating their own row (`id = auth.uid()`), enforced by RLS itself
 * via .eq("id", user.id), not by an app-level role check. Nothing else on
 * profiles is writable through this action, and profiles has no
 * organization/role/membership columns at all -- there is no path by which
 * this could touch org, role, membership, or ownership data. Bound to a
 * slug from the Server Component that renders the edit form (mirrors
 * createPublicSubmission's binding pattern) purely so the right pages get
 * revalidated -- the slug itself plays no role in authorization here.
 */
export async function updateCustomerFullName(
  slug: string,
  _prevState: UpdateProfileFormState,
  formData: FormData,
): Promise<UpdateProfileFormState> {
  const fullName = String(formData.get("fullName") ?? "").trim();

  if (!fullName) {
    return { status: "error", fieldErrors: { fullName: "Enter your full name." } };
  }
  if (fullName.length > MAX_CUSTOMER_NAME_LENGTH) {
    return { status: "error", fieldErrors: { fullName: `Keep it under ${MAX_CUSTOMER_NAME_LENGTH} characters.` } };
  }

  const supabase = await createClient();
  let userId: string;
  try {
    userId = (await getAuthenticatedUser(supabase)).id;
  } catch {
    return { status: "error", message: "Sign in to update your profile." };
  }

  const { error } = await supabase.from("profiles").update({ full_name: fullName }).eq("id", userId);
  if (error) {
    console.error("updateCustomerFullName failed:", error);
    return { status: "error", message: "Something went wrong updating your profile." };
  }

  revalidatePath(`/feedback/${slug}`);
  revalidatePath(`/feedback/${slug}/profile`);
  revalidatePath(`/feedback/${slug}/my-feedback`);
  return { status: "idle" };
}

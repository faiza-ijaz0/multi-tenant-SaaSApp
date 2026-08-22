"use server";

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";

import { isEligibleCustomerForOrganization, NOT_A_CUSTOMER_MESSAGE } from "@/features/customers/customer-eligibility";
import { ensureCustomerOfOrganization } from "@/features/customers/ensure-customer";
import { getPortalBySlug } from "@/features/portal-settings/queries";
import { getTenantScope } from "@/lib/auth/context";
import { getAuthenticatedUser } from "@/lib/auth/user";
import { createClient } from "@/lib/supabase/server";
import { ACTION_OK, type ActionResult } from "@/lib/action-result";
import { requireAction, requireAnyAction } from "@/lib/authorization/permissions";

import {
  MAX_DESCRIPTION_LENGTH,
  MAX_TITLE_LENGTH,
  type SubmissionFormState,
} from "./form-state";
import { getDefaultStatusId, type SubmissionType } from "./queries";
import { updateSubmissionStatusForOrganization } from "./status";

interface ValidatedSubmissionInput {
  title: string;
  description: string;
  type: SubmissionType;
  categoryId: string | null;
  fieldErrors: SubmissionFormState["fieldErrors"];
}

function validateSubmissionInput(formData: FormData): ValidatedSubmissionInput {
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const rawType = String(formData.get("type") ?? "");
  const categoryId = String(formData.get("categoryId") ?? "").trim() || null;

  const fieldErrors: SubmissionFormState["fieldErrors"] = {};
  if (!title) {
    fieldErrors.title = "Enter a title.";
  } else if (title.length > MAX_TITLE_LENGTH) {
    fieldErrors.title = `Keep it under ${MAX_TITLE_LENGTH} characters.`;
  }
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    fieldErrors.description = `Keep it under ${MAX_DESCRIPTION_LENGTH} characters.`;
  }
  if (rawType !== "feature" && rawType !== "bug") {
    fieldErrors.type = "Choose a type.";
  }

  return { title, description, type: rawType as SubmissionType, categoryId, fieldErrors };
}

async function insertSubmission(
  supabase: SupabaseClient,
  organizationId: string,
  submittedBy: string,
  input: { title: string; description: string; type: SubmissionType; categoryId: string | null },
): Promise<{ error: string | null }> {
  let statusId: string;
  try {
    statusId = await getDefaultStatusId(supabase, organizationId);
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "This organization has no open status configured yet.",
    };
  }

  const { error } = await supabase.from("submissions").insert({
    id: randomUUID(),
    organization_id: organizationId,
    category_id: input.categoryId,
    status_id: statusId,
    submitted_by: submittedBy,
    title: input.title,
    description: input.description || null,
    type: input.type,
  });

  return { error: error ? error.message : null };
}

/**
 * Public-portal submission creation. Bound to the portal's slug from the
 * Server Component that renders the form
 * (`createPublicSubmission.bind(null, slug)`), so the action's real
 * signature after binding is (prevState, formData) -- what useActionState
 * expects. organization_id is never taken from client input: it's
 * re-derived here from the slug via the same RLS-gated portal lookup the
 * page itself uses, so a tampered hidden field can't redirect the
 * submission to a different organization. True anonymous submission isn't
 * possible under the current RLS model (submissions_insert_member_or_customer
 * is `to authenticated` only) -- see the Phase 5 report -- so this requires
 * a real session and self-registers the caller as a customer first.
 */
export async function createPublicSubmission(
  slug: string,
  _prevState: SubmissionFormState,
  formData: FormData,
): Promise<SubmissionFormState> {
  const { title, description, type, categoryId, fieldErrors } = validateSubmissionInput(formData);
  if (fieldErrors && Object.keys(fieldErrors).length > 0) {
    return { status: "error", fieldErrors };
  }

  const supabase = await createClient();

  let user;
  try {
    user = await getAuthenticatedUser(supabase);
  } catch {
    return { status: "error", message: "Sign in to submit feedback." };
  }

  const portal = await getPortalBySlug(supabase, slug);
  if (!portal) {
    return { status: "error", message: "This portal is no longer available." };
  }

  // Phase 4: the customer-portal submission form is customer-only -- an
  // internal owner/admin/member of this exact org must not be silently
  // registered as a customer just by posting to this action (the bug this
  // phase fixes). They already have createMemberSubmission
  // (submissions:create, dashboard-originated) for adding submissions to
  // their own org; this path stays reserved for real customers.
  const eligible = await isEligibleCustomerForOrganization(supabase, user.id, portal.organizationId);
  if (!eligible) {
    return { status: "error", message: NOT_A_CUSTOMER_MESSAGE };
  }

  try {
    await ensureCustomerOfOrganization(supabase, user.id, portal.organizationId, user.email ?? "", user.fullName);
  } catch (error) {
    console.error("ensureCustomerOfOrganization failed:", error);
    return { status: "error", message: "Something went wrong. Please try again." };
  }

  const { error } = await insertSubmission(supabase, portal.organizationId, user.id, {
    title,
    description,
    type,
    categoryId,
  });

  if (error) {
    console.error("createPublicSubmission failed:", error);
    return { status: "error", message: "Something went wrong submitting your feedback." };
  }

  revalidatePath(`/feedback/${slug}`);
  // So a submission made through the header/hero SubmitFeedbackDialog (usable
  // from any page in the portal, not just Home) is reflected immediately in
  // My Feedback and the profile summary without a manual refresh.
  revalidatePath(`/feedback/${slug}/my-feedback`);
  revalidatePath(`/feedback/${slug}/profile`);
  return { status: "idle" };
}

/** Dashboard-originated submission creation by an org member/admin. */
export async function createMemberSubmission(
  _prevState: SubmissionFormState,
  formData: FormData,
): Promise<SubmissionFormState> {
  const { title, description, type, categoryId, fieldErrors } = validateSubmissionInput(formData);
  if (fieldErrors && Object.keys(fieldErrors).length > 0) {
    return { status: "error", fieldErrors };
  }

  const scope = await getTenantScope();
  try {
    await requireAction(scope, "submissions:create");
  } catch {
    return { status: "error", message: "You don't have permission to submit feedback." };
  }

  const { error } = await insertSubmission(scope.supabase, scope.organization.id, scope.user.id, {
    title,
    description,
    type,
    categoryId,
  });

  if (error) {
    console.error("createMemberSubmission failed:", error);
    return { status: "error", message: "Something went wrong creating the submission." };
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/submissions");
  return { status: "idle" };
}

/**
 * Status change on someone else's submission requires submissions:edit OR
 * submissions:manage (see 0013_membership_action_permissions.sql's comment
 * on why RLS can't give "manage" a distinct effect from "edit" on this
 * column). The author of the submission may always change its own status --
 * mirrors the unconditional author branch already in
 * submissions_update_author_or_member.
 *
 * audit_events_insert_admin requires the actor to be an org admin, which is
 * why this specific action can log to the real audit trail while member/
 * customer-performed actions (see comments.ts, votes.ts) currently cannot
 * without the 0012 RPC (out of scope for this phase).
 */
export async function updateSubmissionStatus(
  submissionId: string,
  statusId: string,
): Promise<ActionResult> {
  const scope = await getTenantScope();
  try {
    await requireAnyAction(scope, ["submissions:edit", "submissions:manage"]);
  } catch {
    return { ok: false, message: "You don't have permission to change this submission's status." };
  }

  const result = await updateSubmissionStatusForOrganization(
    scope.supabase,
    scope.organization.id,
    scope.user.id,
    submissionId,
    statusId,
  );
  if (!result.ok) {
    return { ok: false, message: result.message };
  }

  revalidatePath(`/dashboard/submissions/${submissionId}`);
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/submissions");
  return ACTION_OK;
}

/**
 * Editing someone else's submission requires submissions:edit -- the author
 * may always edit their own (unconditional author branch in
 * submissions_update_author_or_member, 0010/0013). No app-level "edit
 * content" UI existed before this phase; this completes the CRUD surface
 * the permission matrix (registry.ts) requires be meaningfully enforceable,
 * not just a checkbox with nothing behind it.
 */
export async function updateSubmissionContent(
  submissionId: string,
  _prevState: SubmissionFormState,
  formData: FormData,
): Promise<SubmissionFormState> {
  const { title, description, fieldErrors } = validateSubmissionInput(formData);
  if (fieldErrors?.title || fieldErrors?.description) {
    return { status: "error", fieldErrors };
  }

  const scope = await getTenantScope();
  const { data, error } = await scope.supabase
    .from("submissions")
    .update({ title, description: description || null })
    .eq("id", submissionId)
    .eq("organization_id", scope.organization.id)
    .select("id");

  if (error) {
    console.error("updateSubmissionContent failed:", error);
    return { status: "error", message: "Something went wrong updating the submission." };
  }
  if (!data || data.length === 0) {
    // Zero rows affected means RLS denied it (not the author, and no
    // submissions:edit/manage grant) or the row no longer exists -- either
    // way, submissions_update_author_or_member is the real boundary here,
    // not a role check in this action.
    return { status: "error", message: "You don't have permission to edit this submission." };
  }

  revalidatePath(`/dashboard/submissions/${submissionId}`);
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/submissions");
  return { status: "idle" };
}

/**
 * Delete has no author branch in submissions_delete_admin -- it is, and
 * remains, admin-only, gated by submissions:delete. Matches the spec's own
 * hedge that "own submission delete" for a plain Member only applies "where
 * existing product rules permit," and this architecture's RLS never granted
 * authors delete rights on their own submissions.
 */
export async function deleteSubmission(submissionId: string): Promise<ActionResult> {
  const scope = await getTenantScope();
  try {
    await requireAction(scope, "submissions:delete");
  } catch {
    return { ok: false, message: "You don't have permission to delete this submission." };
  }

  const { error } = await scope.supabase
    .from("submissions")
    .delete()
    .eq("id", submissionId)
    .eq("organization_id", scope.organization.id);

  if (error) {
    console.error("deleteSubmission failed:", error);
    return { ok: false, message: "Something went wrong deleting the submission." };
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/submissions");
  return ACTION_OK;
}

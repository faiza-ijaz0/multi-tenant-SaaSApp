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
import { requireAction } from "@/lib/authorization/permissions";

import { MAX_COMMENT_LENGTH, type CommentFormState } from "./form-state";

function validateBody(formData: FormData): { body: string; error?: string } {
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return { body, error: "Enter a comment." };
  if (body.length > MAX_COMMENT_LENGTH) {
    return { body, error: `Keep it under ${MAX_COMMENT_LENGTH} characters.` };
  }
  return { body };
}

/**
 * Framework-agnostic core, same extraction pattern as
 * features/submissions/status.ts's updateSubmissionStatusForOrganization --
 * directly testable with a real Supabase session, since the "use server"
 * actions wrapping this can't run outside a Next.js request. Performs no
 * authorization decisions of its own -- comments_insert_member_or_customer
 * (0003_rls_policies.sql) is the actual enforcement of who may set
 * isInternal = true; this is purely the insert, shared by both the
 * portal-visitor and dashboard-member call paths below.
 */
export async function createCommentForSubmission(
  supabase: SupabaseClient,
  submissionId: string,
  authorProfileId: string,
  body: string,
  isInternal: boolean,
): Promise<{ ok: boolean; message?: string }> {
  const { error } = await supabase.from("comments").insert({
    id: randomUUID(),
    submission_id: submissionId,
    author_profile_id: authorProfileId,
    body,
    is_internal: isInternal,
  });

  if (error) {
    console.error("createCommentForSubmission failed:", error);
    return { ok: false, message: "Something went wrong posting your comment." };
  }

  return { ok: true };
}

/**
 * Public-portal comment creation, bound to (slug, submissionId) from the
 * Server Component that renders the form. Always non-internal --
 * comments_insert_member_or_customer only allows a non-member to create a
 * comment when is_internal = false, so there's no code path here that
 * could ever produce an internal comment for a portal visitor. Requires
 * customer self-registration first (comment creation has no "portal is
 * public" fallback the way voting does -- see the RLS policy).
 */
export async function createPortalComment(
  slug: string,
  submissionId: string,
  _prevState: CommentFormState,
  formData: FormData,
): Promise<CommentFormState> {
  const { body, error: validationError } = validateBody(formData);
  if (validationError) {
    return { status: "error", fieldErrors: { body: validationError } };
  }

  const supabase = await createClient();

  let user;
  try {
    user = await getAuthenticatedUser(supabase);
  } catch {
    return { status: "error", message: "Sign in to comment." };
  }

  const portal = await getPortalBySlug(supabase, slug);
  if (!portal) {
    return { status: "error", message: "This portal is no longer available." };
  }

  // Phase 4: same customer-only boundary as createPublicSubmission -- an
  // internal owner/admin/member of this exact org must not be silently
  // registered as a customer by posting a portal comment. They already
  // have createMemberComment (comments:create, dashboard-originated) for
  // commenting on their own org's submissions.
  const eligible = await isEligibleCustomerForOrganization(supabase, user.id, portal.organizationId);
  if (!eligible) {
    return { status: "error", message: NOT_A_CUSTOMER_MESSAGE };
  }

  try {
    await ensureCustomerOfOrganization(supabase, user.id, portal.organizationId, user.email ?? "");
  } catch (error) {
    console.error("ensureCustomerOfOrganization failed:", error);
    return { status: "error", message: "Something went wrong. Please try again." };
  }

  const result = await createCommentForSubmission(supabase, submissionId, user.id, body, false);
  if (!result.ok) {
    return { status: "error", message: result.message };
  }

  revalidatePath(`/feedback/${slug}/${submissionId}`);
  return { status: "idle" };
}

/**
 * Dashboard-originated comment by an org member/admin. isInternal is only
 * ever honored when the caller is genuinely a member -- comments_insert_member_or_customer
 * is the real enforcement, this is just a clean pre-check.
 */
export async function createMemberComment(
  submissionId: string,
  _prevState: CommentFormState,
  formData: FormData,
): Promise<CommentFormState> {
  const { body, error: validationError } = validateBody(formData);
  if (validationError) {
    return { status: "error", fieldErrors: { body: validationError } };
  }
  const isInternal = formData.get("isInternal") === "on";

  const scope = await getTenantScope();
  try {
    await requireAction(scope, "comments:create");
  } catch {
    return { status: "error", message: "You don't have permission to comment." };
  }

  const result = await createCommentForSubmission(scope.supabase, submissionId, scope.user.id, body, isInternal);
  if (!result.ok) {
    return { status: "error", message: result.message };
  }

  revalidatePath(`/dashboard/submissions/${submissionId}`);
  return { status: "idle" };
}

/**
 * The author of a comment may always delete their own (unconditional author
 * branch in comments_delete_author_or_admin); deleting someone else's
 * requires comments:moderate. Deliberately does NOT use getTenantScope() --
 * comments can be authored by a portal customer with no organization
 * membership at all (app/feedback/[slug]/[id]/page.tsx), and that author
 * must still be able to delete their own comment. Uses the same plain
 * authenticated client every portal action uses instead. No app-level
 * pre-check for "is this my comment" -- the delete is attempted directly
 * and RLS is the real authorization boundary, same zero-rows-means-denied
 * shape used throughout this codebase (e.g. features/categories/actions.ts's
 * updateCategory).
 */
export async function deleteComment(commentId: string, submissionId: string): Promise<ActionResult> {
  const supabase = await createClient();
  try {
    await getAuthenticatedUser(supabase);
  } catch {
    return { ok: false, message: "Sign in to delete this comment." };
  }

  const { error } = await supabase.from("comments").delete().eq("id", commentId);

  if (error) {
    console.error("deleteComment failed:", error);
    return { ok: false, message: "Something went wrong deleting the comment." };
  }

  revalidatePath(`/dashboard/submissions/${submissionId}`);
  return ACTION_OK;
}

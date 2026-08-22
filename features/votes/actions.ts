"use server";

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";

import { ACTION_OK, type ActionResult } from "@/lib/action-result";
import { ensureProfileExists } from "@/lib/auth/profile";
import { getAuthenticatedUser } from "@/lib/auth/user";
import { createClient } from "@/lib/supabase/server";

/**
 * Every page that could show this submission's vote count, derived
 * entirely from the submission's own (RLS-scoped) organization_id and its
 * portal slug -- never from a client-supplied path. Anyone who could vote
 * on this submission at all already satisfies submissions_select_scoped
 * for the same row (member, customer, or public-portal access), so these
 * lookups never fail for a legitimate voter; if either lookup comes back
 * empty, revalidation is just narrower (the vote itself already
 * succeeded/failed independently of this).
 */
export async function resolveVoteRevalidationPaths(
  supabase: SupabaseClient,
  submissionId: string,
): Promise<string[]> {
  const paths = [`/dashboard/submissions/${submissionId}`];

  const { data: submission } = await supabase
    .from("submissions")
    .select("organization_id")
    .eq("id", submissionId)
    .maybeSingle();
  if (!submission) return paths;

  const { data: portal } = await supabase
    .from("portal_settings")
    .select("slug")
    .eq("organization_id", submission.organization_id as string)
    .maybeSingle();
  if (portal?.slug) {
    paths.push(`/feedback/${portal.slug}`, `/feedback/${portal.slug}/${submissionId}`);
  }

  return paths;
}

/**
 * Framework-agnostic core, same extraction pattern as
 * features/submissions/status.ts's updateSubmissionStatusForOrganization --
 * directly testable with a real Supabase session, since the "use server"
 * actions wrapping these can't run outside a Next.js request (createClient()
 * needs cookies()). votes_insert_authenticated allows any authenticated
 * user to vote on a submission whose organization they're a member of, a
 * customer of, OR whose portal is simply public -- unlike submission/
 * comment creation, voting has no separate customer self-registration
 * requirement. A profiles row is still ensured first, since votes.user_id
 * has a hard FK to profiles.id and this may be the caller's first-ever
 * write.
 */
export async function addVoteForSubmission(
  supabase: SupabaseClient,
  userId: string,
  submissionId: string,
): Promise<ActionResult> {
  await ensureProfileExists(supabase, userId);

  const { error } = await supabase.from("votes").insert({
    id: randomUUID(),
    submission_id: submissionId,
    user_id: userId,
  });

  if (error) {
    if (error.code === "23505") {
      return { ok: false, message: "You've already voted on this." };
    }
    console.error("addVoteForSubmission failed:", error);
    return { ok: false, message: "Something went wrong recording your vote." };
  }

  return ACTION_OK;
}

export async function removeVoteForSubmission(
  supabase: SupabaseClient,
  userId: string,
  submissionId: string,
): Promise<ActionResult> {
  const { error } = await supabase
    .from("votes")
    .delete()
    .eq("submission_id", submissionId)
    .eq("user_id", userId);

  if (error) {
    console.error("removeVoteForSubmission failed:", error);
    return { ok: false, message: "Something went wrong removing your vote." };
  }

  return ACTION_OK;
}

export async function addVote(submissionId: string): Promise<ActionResult> {
  const supabase = await createClient();

  let user;
  try {
    user = await getAuthenticatedUser(supabase);
  } catch {
    return { ok: false, message: "Sign in to vote." };
  }

  const result = await addVoteForSubmission(supabase, user.id, submissionId);
  if (!result.ok) return result;

  const paths = await resolveVoteRevalidationPaths(supabase, submissionId);
  for (const path of paths) revalidatePath(path);
  return ACTION_OK;
}

export async function removeVote(submissionId: string): Promise<ActionResult> {
  const supabase = await createClient();

  let user;
  try {
    user = await getAuthenticatedUser(supabase);
  } catch {
    return { ok: false, message: "Sign in to manage your vote." };
  }

  const result = await removeVoteForSubmission(supabase, user.id, submissionId);
  if (!result.ok) return result;

  const paths = await resolveVoteRevalidationPaths(supabase, submissionId);
  for (const path of paths) revalidatePath(path);
  return ACTION_OK;
}

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface UpdateStatusResult {
  ok: boolean;
  message?: string;
  /** False when the submission was already in this status -- a safe no-op, not a failure. */
  changed: boolean;
}

/**
 * Framework-agnostic core for an admin-authorized submission status
 * change, extracted so it's directly testable with a real Supabase
 * session (the "use server" action wrapping this can't be invoked outside
 * the Next.js request runtime -- see features/submissions/actions.ts).
 *
 * Callers must have already verified the actor is an org admin -- this
 * function does not re-check role, only tenant scoping (organizationId is
 * assumed server-resolved, e.g. from getTenantScope()). The no-op-if-
 * unchanged check exists specifically to avoid a duplicate audit_events
 * row on a retried/double-submitted request.
 */
export async function updateSubmissionStatusForOrganization(
  supabase: SupabaseClient,
  organizationId: string,
  actorUserId: string,
  submissionId: string,
  statusId: string,
): Promise<UpdateStatusResult> {
  const current = await supabase
    .from("submissions")
    .select("status_id")
    .eq("id", submissionId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (current.error) {
    console.error("updateSubmissionStatusForOrganization failed to load current status:", current.error);
    return { ok: false, message: "Something went wrong updating the status.", changed: false };
  }
  if (!current.data) {
    return { ok: false, message: "Submission not found.", changed: false };
  }
  if (current.data.status_id === statusId) {
    return { ok: true, changed: false };
  }

  const { data: updated, error } = await supabase
    .from("submissions")
    .update({ status_id: statusId })
    .eq("id", submissionId)
    .eq("organization_id", organizationId)
    .select("id");

  if (error) {
    console.error("updateSubmissionStatusForOrganization failed:", error);
    // submissions_status_org_fk is a composite FK against
    // statuses(organization_id, id) -- a status id from another
    // organization is structurally rejected here, not just by app logic.
    if (error.code === "23503") {
      return { ok: false, message: "That status doesn't belong to this organization.", changed: false };
    }
    return { ok: false, message: "Something went wrong updating the status.", changed: false };
  }
  if (!updated || updated.length === 0) {
    // RLS (submissions_update_author_or_member) denied the write --
    // Postgres doesn't error on an UPDATE that matches zero rows, so
    // without this check a caller who isn't actually authorized would
    // silently fall through to a (wrong) success and a fabricated audit
    // event. The `.select("id")` above is what makes 0-rows-affected
    // detectable at all.
    return { ok: false, message: "You don't have permission to update this submission.", changed: false };
  }

  const { error: auditError } = await supabase.from("audit_events").insert({
    id: randomUUID(),
    organization_id: organizationId,
    actor_profile_id: actorUserId,
    action: "submission.status_changed",
    entity_type: "submission",
    entity_id: submissionId,
    metadata: { from_status_id: current.data.status_id, status_id: statusId },
  });
  if (auditError) {
    // Non-fatal: the status change itself already succeeded.
    console.error("audit_events insert failed:", auditError);
  }

  return { ok: true, changed: true };
}

/**
 * The single intended integration point for triggering a notification
 * (status changed, comment added, submission created, etc.) from any
 * future feature code.
 *
 * NOT CALLABLE YET. `notifications` has no INSERT policy for any role --
 * not even admins -- by deliberate design (see 0003_rls_policies.sql's own
 * comment: "Real creation will go through a SECURITY DEFINER trigger/
 * function in whichever later phase adds the triggering events... which
 * bypasses RLS by design rather than needing a client-facing INSERT policy
 * here"). That function does not exist yet. Creating one requires a
 * migration, which requires explicit approval -- see the Phase 6 report
 * for the exact proposed migration, RLS/security reasoning, and
 * validation rules.
 *
 * This throws deliberately rather than silently no-op-ing, returning fake
 * success, or reaching for service-role credentials to route around RLS.
 * A future caller gets a loud, unambiguous failure instead of a feature
 * that appears to work but never actually creates anything -- and this
 * function is where the real implementation belongs once the migration
 * below is approved and applied.
 */
export interface CreateNotificationInput {
  profileId: string;
  organizationId: string;
  type: string;
  payload?: Record<string, unknown>;
}

export async function createNotification(input: CreateNotificationInput): Promise<never> {
  throw new Error(
    `Notification creation is not implemented (attempted type "${input.type}"): the ` +
      "notifications table has no INSERT RLS policy for any role. A SECURITY DEFINER " +
      "migration is required and must be explicitly approved before this can be " +
      "implemented -- see the Phase 6 report.",
  );
}

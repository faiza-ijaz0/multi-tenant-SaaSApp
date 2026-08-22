export interface InvitationEmailInput {
  email: string;
  organizationName: string;
  inviteUrl: string;
}

/**
 * The intended integration point for actually emailing an invitation link,
 * once this project has an email provider (Resend, Postmark, SES, etc.)
 * configured -- none is wired up yet, and no third-party dependency has
 * been added on the strength of this one feature. Deliberately a no-op
 * that returns false rather than pretending to send anything: no fake
 * "email sent" success message anywhere in this codebase should ever
 * depend on this function having actually delivered mail.
 *
 * This does not block invitation creation from being fully functional --
 * features/members/actions.ts's createInvitation shows the admin a
 * copyable invite link (features/members/invitation-management.tsx)
 * regardless of whether this succeeds, since manual sharing is the only
 * delivery path that currently exists.
 */
export async function sendInvitationEmail(input: InvitationEmailInput): Promise<boolean> {
  // input is intentionally accepted (not discarded) so this stays a
  // drop-in replacement target once a real provider is wired up -- it
  // does not log any part of it (email addresses are PII; nothing in
  // this codebase's existing logging conventions logs a raw email either).
  void input;
  return false;
}

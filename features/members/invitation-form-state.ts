export const MAX_INVITATION_EMAIL_LENGTH = 255;

export interface InvitationFormState {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: {
    email?: string;
    role?: string;
  };
  /** Only set on success -- the one-time invite link to copy and share. */
  inviteUrl?: string;
}

export const initialInvitationFormState: InvitationFormState = { status: "idle" };

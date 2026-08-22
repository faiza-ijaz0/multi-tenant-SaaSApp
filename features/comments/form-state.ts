export const MAX_COMMENT_LENGTH = 3000;

export interface CommentFormState {
  status: "idle" | "error";
  message?: string;
  fieldErrors?: {
    body?: string;
  };
}

export const initialCommentFormState: CommentFormState = { status: "idle" };

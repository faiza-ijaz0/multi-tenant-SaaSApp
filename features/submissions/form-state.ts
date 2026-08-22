export const MAX_TITLE_LENGTH = 150;
export const MAX_DESCRIPTION_LENGTH = 5000;

export interface SubmissionFormState {
  status: "idle" | "error";
  message?: string;
  fieldErrors?: {
    title?: string;
    description?: string;
    type?: string;
  };
}

export const initialSubmissionFormState: SubmissionFormState = { status: "idle" };

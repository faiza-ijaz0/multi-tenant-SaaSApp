export const MAX_CATEGORY_NAME_LENGTH = 60;
export const MAX_CATEGORY_DESCRIPTION_LENGTH = 280;

export interface CategoryFormState {
  status: "idle" | "error";
  message?: string;
  fieldErrors?: {
    name?: string;
    description?: string;
  };
}

export const initialCategoryFormState: CategoryFormState = { status: "idle" };

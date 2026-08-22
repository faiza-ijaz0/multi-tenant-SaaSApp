/** Generic result for a direct (non-form) Server Action -- delete, reorder, etc. */
export interface ActionResult {
  ok: boolean;
  message?: string;
}

export const ACTION_OK: ActionResult = { ok: true };

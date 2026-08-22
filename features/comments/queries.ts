import type { SupabaseClient } from "@supabase/supabase-js";

export interface Comment {
  id: string;
  submissionId: string;
  authorProfileId: string | null;
  body: string;
  isInternal: boolean;
  createdAt: string;
}

const COMMENT_LIST_LIMIT = 500;

/**
 * RLS (comments_select_scoped) is what actually keeps internal comments
 * from leaking to customers/the public -- it filters is_internal=true rows
 * out for anyone who isn't an organization member, regardless of what this
 * query asks for. This function returns whatever RLS allows through, full
 * stop.
 *
 * Bounded, unlike categories/statuses/members: those are small,
 * admin-curated lists (tens of rows at most), while comments are
 * unbounded, ongoing user-generated content on a single submission -- the
 * one list in this codebase with no natural cap, so it gets an explicit
 * one, matching the bounded-list convention already used for submissions
 * (200), audit events (50), and notifications (20).
 */
export async function listComments(
  supabase: SupabaseClient,
  submissionId: string,
): Promise<Comment[]> {
  const { data, error } = await supabase
    .from("comments")
    .select("id, submission_id, author_profile_id, body, is_internal, created_at")
    .eq("submission_id", submissionId)
    .order("created_at", { ascending: true })
    .limit(COMMENT_LIST_LIMIT);

  if (error) {
    throw new Error(`Failed to load comments: ${error.message}`);
  }

  return (data ?? []).map((row) => ({
    id: row.id as string,
    submissionId: row.submission_id as string,
    authorProfileId: (row.author_profile_id as string | null) ?? null,
    body: row.body as string,
    isInternal: row.is_internal as boolean,
    createdAt: row.created_at as string,
  }));
}

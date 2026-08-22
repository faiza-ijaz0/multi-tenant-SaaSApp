import type { SupabaseClient } from "@supabase/supabase-js";

export async function hasVoted(
  supabase: SupabaseClient,
  submissionId: string,
  userId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("votes")
    .select("id")
    .eq("submission_id", submissionId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to check vote status: ${error.message}`);
  }
  return Boolean(data);
}

/** One query for a whole list view instead of one hasVoted() call per row. */
export async function getVotedSubmissionIds(
  supabase: SupabaseClient,
  userId: string,
  submissionIds: string[],
): Promise<Set<string>> {
  if (submissionIds.length === 0) return new Set();

  const { data, error } = await supabase
    .from("votes")
    .select("submission_id")
    .eq("user_id", userId)
    .in("submission_id", submissionIds);

  if (error) {
    throw new Error(`Failed to load vote status: ${error.message}`);
  }
  return new Set((data ?? []).map((row) => row.submission_id as string));
}

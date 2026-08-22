import type { SupabaseClient } from "@supabase/supabase-js";

import { getRollingBoundaries } from "@/lib/analytics/time-ranges";

export type SubmissionType = "feature" | "bug";

export interface SubmissionSummary {
  id: string;
  title: string;
  type: SubmissionType;
  createdAt: string;
  updatedAt: string;
  categoryId: string | null;
  categoryName: string | null;
  statusId: string;
  statusName: string;
  statusColor: string;
  voteCount: number;
  submittedBy: string | null;
}

export interface SubmissionDetail extends SubmissionSummary {
  description: string | null;
}

export interface SubmissionFilters {
  statusId?: string;
  categoryId?: string;
  type?: SubmissionType;
  search?: string;
  sort?: "newest" | "oldest" | "most_votes";
  /** Open (false) vs. resolved/closed (true) -- an aggregate dimension
   * distinct from statusId (a specific status), used by the dashboard's
   * "Open"/"Resolved" stat cards to link to a genuinely filtered view. */
  isClosed?: boolean;
  /** Narrows to one author's own submissions -- e.g. the customer portal's
   * "My Feedback" view. Purely an additional filter on top of whatever this
   * organizationId's submissions_select_scoped RLS already permits the
   * caller to see; it never widens visibility, so it's safe to pass any
   * already-authenticated user's own id here. */
  submittedBy?: string;
}

// statuses!inner (not the plain embed used elsewhere): every submission's
// status_id is NOT NULL with an enforced FK, so an inner join never drops
// a row that a left join would have kept -- it's required here only so
// `.eq("statuses.is_closed", ...)` below is a valid embedded-resource
// filter, not to change which submissions are returned.
const SUBMISSION_SELECT =
  "id, title, description, type, created_at, updated_at, category_id, status_id, submitted_by, categories(name), statuses!inner(name, color, is_closed), votes(count)";

interface RawSubmissionRow {
  id: string;
  title: string;
  description: string | null;
  type: SubmissionType;
  created_at: string;
  updated_at: string;
  category_id: string | null;
  status_id: string;
  submitted_by: string | null;
  categories: { name: string } | { name: string }[] | null;
  statuses: { name: string; color: string; is_closed: boolean } | { name: string; color: string; is_closed: boolean }[] | null;
  votes: { count: number } | { count: number }[] | null;
}

function first<T>(value: T | T[] | null): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function mapRow(row: RawSubmissionRow): SubmissionDetail {
  const category = first(row.categories);
  const status = first(row.statuses);
  const voteRow = first(row.votes);

  return {
    id: row.id,
    title: row.title,
    description: row.description,
    type: row.type,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    categoryId: row.category_id,
    categoryName: category?.name ?? null,
    statusId: row.status_id,
    statusName: status?.name ?? "",
    statusColor: status?.color ?? "#6b7280",
    voteCount: voteRow?.count ?? 0,
    submittedBy: row.submitted_by,
  };
}

/**
 * organizationId must already be a server-resolved, RLS-verified value --
 * never a raw client-supplied id trusted for authorization. RLS
 * (submissions_select_scoped) independently re-enforces visibility
 * regardless. Vote counts come from PostgREST's embedded-resource count
 * (votes(count)) rather than a denormalized column -- there isn't one, by
 * design (see 0001_initial_schema.sql's comment on votes).
 *
 * "most_votes" sorting happens in application code after fetch: ordering
 * by an aggregated embedded count isn't something a single PostgREST
 * request can do safely, and submission volume per portal is expected to
 * be modest enough that this is simpler and just as correct as a
 * database-level sort would be.
 */
export async function listSubmissions(
  supabase: SupabaseClient,
  organizationId: string,
  filters: SubmissionFilters = {},
): Promise<SubmissionDetail[]> {
  let query = supabase
    .from("submissions")
    .select(SUBMISSION_SELECT)
    .eq("organization_id", organizationId);

  if (filters.statusId) query = query.eq("status_id", filters.statusId);
  if (filters.categoryId) query = query.eq("category_id", filters.categoryId);
  if (filters.type) query = query.eq("type", filters.type);
  if (filters.search) query = query.ilike("title", `%${filters.search}%`);
  if (filters.isClosed !== undefined) query = query.eq("statuses.is_closed", filters.isClosed);
  if (filters.submittedBy) query = query.eq("submitted_by", filters.submittedBy);

  query = query.order("created_at", { ascending: filters.sort === "oldest" }).limit(200);

  const { data, error } = await query.returns<RawSubmissionRow[]>();
  if (error) {
    throw new Error(`Failed to load submissions: ${error.message}`);
  }

  const rows = (data ?? []).map(mapRow);
  if (filters.sort === "most_votes") {
    rows.sort((a, b) => b.voteCount - a.voteCount);
  }
  return rows;
}

export async function getSubmission(
  supabase: SupabaseClient,
  organizationId: string,
  submissionId: string,
): Promise<SubmissionDetail | null> {
  const { data, error } = await supabase
    .from("submissions")
    .select(SUBMISSION_SELECT)
    .eq("organization_id", organizationId)
    .eq("id", submissionId)
    .maybeSingle()
    .returns<RawSubmissionRow | null>();

  if (error) {
    throw new Error(`Failed to load submission: ${error.message}`);
  }
  if (!data) return null;
  return mapRow(data);
}

/**
 * Small, direct .limit() query -- distinct from listSubmissions, which
 * exists for the filtered/sorted browse view. This is always unfiltered
 * and newest-first, for an at-a-glance "recent activity" summary
 * regardless of whatever filters the main list currently has applied.
 */
export async function listRecentSubmissions(
  supabase: SupabaseClient,
  organizationId: string,
  limit = 5,
): Promise<SubmissionSummary[]> {
  const { data, error } = await supabase
    .from("submissions")
    .select(SUBMISSION_SELECT)
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(limit)
    .returns<RawSubmissionRow[]>();

  if (error) {
    throw new Error(`Failed to load recent submissions: ${error.message}`);
  }
  return (data ?? []).map(mapRow);
}

export interface SubmissionStats {
  total: number;
  open: number;
  resolved: number;
  today: number;
  newThisWeek: number;
  /** The prior 7-day window (8-14 days ago) -- real data, used only to
   * show a week-over-week trend next to newThisWeek, never fabricated. */
  newPriorWeek: number;
  newThisMonth: number;
  byStatus: { statusId: string; name: string; color: string; count: number }[];
}

/**
 * Every number here comes from a real, RLS-scoped COUNT query -- never
 * fabricated or estimated. Uses `head: true` count-only requests (no row
 * data transferred) so this stays cheap regardless of submission volume.
 * The open/resolved split filters through the statuses!inner embed rather
 * than fetching every row's status client-side, so this is O(1) queries
 * for the headline numbers plus one small count per status (bounded by
 * however many statuses this organization has configured, typically a
 * handful) for the breakdown -- never O(submission count).
 */
export async function getSubmissionStats(
  supabase: SupabaseClient,
  organizationId: string,
  statuses: { id: string; name: string; color: string }[],
): Promise<SubmissionStats> {
  const now = Date.now();
  const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
  const twoWeeksAgo = new Date(now - 14 * 24 * 60 * 60 * 1000).toISOString();
  const { startOfToday, startOfMonth } = getRollingBoundaries();

  const [totalResult, openResult, resolvedResult, todayResult, weekResult, priorWeekResult, monthResult, ...statusResults] =
    await Promise.all([
      supabase.from("submissions").select("id", { count: "exact", head: true }).eq("organization_id", organizationId),
      supabase
        .from("submissions")
        .select("id, statuses!inner(is_closed)", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("statuses.is_closed", false),
      supabase
        .from("submissions")
        .select("id, statuses!inner(is_closed)", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("statuses.is_closed", true),
      supabase
        .from("submissions")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .gte("created_at", startOfToday),
      supabase
        .from("submissions")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .gte("created_at", weekAgo),
      supabase
        .from("submissions")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .gte("created_at", twoWeeksAgo)
        .lt("created_at", weekAgo),
      supabase
        .from("submissions")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .gte("created_at", startOfMonth),
      ...statuses.map((status) =>
        supabase
          .from("submissions")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", organizationId)
          .eq("status_id", status.id),
      ),
    ]);

  for (const result of [totalResult, openResult, resolvedResult, todayResult, weekResult, priorWeekResult, monthResult, ...statusResults]) {
    if (result.error) {
      throw new Error(`Failed to load submission stats: ${result.error.message}`);
    }
  }

  return {
    total: totalResult.count ?? 0,
    open: openResult.count ?? 0,
    resolved: resolvedResult.count ?? 0,
    today: todayResult.count ?? 0,
    newThisWeek: weekResult.count ?? 0,
    newPriorWeek: priorWeekResult.count ?? 0,
    newThisMonth: monthResult.count ?? 0,
    byStatus: statuses.map((status, index) => ({
      statusId: status.id,
      name: status.name,
      color: status.color,
      count: statusResults[index]?.count ?? 0,
    })),
  };
}

/**
 * Just created_at for submissions within [since, now) -- bounded by the
 * caller's chosen date range, never the full table. Server-side chart
 * bucketing (lib/analytics/time-ranges.ts's bucketTimestamps) turns this
 * into a small, already-aggregated series before it ever reaches a client
 * component prop.
 */
export async function getSubmissionTimestampsSince(
  supabase: SupabaseClient,
  organizationId: string,
  since: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("submissions")
    .select("created_at")
    .eq("organization_id", organizationId)
    .gte("created_at", since);

  if (error) {
    throw new Error(`Failed to load submission trend: ${error.message}`);
  }
  return (data ?? []).map((row) => row.created_at as string);
}

export interface CategoryDistributionEntry {
  categoryId: string;
  name: string;
  count: number;
}

/**
 * One bounded count query per category (typically a handful per
 * organization -- same tradeoff already accepted by getSubmissionStats'
 * own byStatus breakdown above), never a full-table fetch counted in JS.
 */
export async function getCategoryDistribution(
  supabase: SupabaseClient,
  organizationId: string,
  categories: { id: string; name: string }[],
): Promise<CategoryDistributionEntry[]> {
  const results = await Promise.all(
    categories.map((category) =>
      supabase
        .from("submissions")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("category_id", category.id),
    ),
  );

  for (const result of results) {
    if (result.error) {
      throw new Error(`Failed to load category distribution: ${result.error.message}`);
    }
  }

  return categories.map((category, index) => ({
    categoryId: category.id,
    name: category.name,
    count: results[index]?.count ?? 0,
  }));
}

export interface CustomerFeedbackStats {
  total: number;
  open: number;
  resolved: number;
  byStatus: { statusId: string; name: string; color: string; count: number }[];
}

/**
 * The customer portal's summary-card equivalent of getSubmissionStats,
 * purpose-built rather than reusing that function with an optional filter:
 * getSubmissionStats also computes today/week/month trend counts the
 * customer summary has no use for, so reusing it here would mean running
 * several needless COUNT queries per page view. Every number is a real,
 * RLS-scoped (submissions_select_scoped, further narrowed by submittedBy)
 * COUNT -- open/resolved come from the same statuses!inner(is_closed) split
 * getSubmissionStats uses, never a hardcoded status name, since a status
 * called "Open" or "In Progress" isn't guaranteed to exist -- only the
 * is_closed boolean is. byStatus (real per-status names/colors/counts) is
 * what actually reveals whatever intermediate statuses this organization
 * defined, without this code guessing at their names.
 */
export async function getCustomerFeedbackStats(
  supabase: SupabaseClient,
  organizationId: string,
  submittedBy: string,
  statuses: { id: string; name: string; color: string }[],
): Promise<CustomerFeedbackStats> {
  const [totalResult, openResult, resolvedResult, ...statusResults] = await Promise.all([
    supabase
      .from("submissions")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("submitted_by", submittedBy),
    supabase
      .from("submissions")
      .select("id, statuses!inner(is_closed)", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("submitted_by", submittedBy)
      .eq("statuses.is_closed", false),
    supabase
      .from("submissions")
      .select("id, statuses!inner(is_closed)", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("submitted_by", submittedBy)
      .eq("statuses.is_closed", true),
    ...statuses.map((status) =>
      supabase
        .from("submissions")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("submitted_by", submittedBy)
        .eq("status_id", status.id),
    ),
  ]);

  for (const result of [totalResult, openResult, resolvedResult, ...statusResults]) {
    if (result.error) {
      throw new Error(`Failed to load feedback stats: ${result.error.message}`);
    }
  }

  return {
    total: totalResult.count ?? 0,
    open: openResult.count ?? 0,
    resolved: resolvedResult.count ?? 0,
    byStatus: statuses.map((status, index) => ({
      statusId: status.id,
      name: status.name,
      color: status.color,
      count: statusResults[index]?.count ?? 0,
    })),
  };
}

export async function getDefaultStatusId(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<string> {
  const { data, error } = await supabase
    .from("statuses")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("is_closed", false)
    .order("sort_order", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to resolve a default status: ${error.message}`);
  }
  if (!data) {
    throw new Error("This organization has no open status configured yet.");
  }
  return data.id as string;
}

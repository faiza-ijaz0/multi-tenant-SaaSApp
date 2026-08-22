/**
 * Rolling-window boundaries (not calendar month/week) -- matches the
 * existing convention in features/submissions/queries.ts's getSubmissionStats
 * (weekAgo = now - 7 days, twoWeeksAgo = now - 14 days for week-over-week
 * trend) rather than introducing a second "calendar month" convention next
 * to it. "This month" here means "the last 30 days," consistently, across
 * every KPI card in the app.
 */
export function getRollingBoundaries(now: Date = new Date()) {
  const ms = now.getTime();
  return {
    startOfToday: new Date(ms - 24 * 60 * 60 * 1000).toISOString(),
    startOfWeek: new Date(ms - 7 * 24 * 60 * 60 * 1000).toISOString(),
    startOfMonth: new Date(ms - 30 * 24 * 60 * 60 * 1000).toISOString(),
    priorWeekStart: new Date(ms - 14 * 24 * 60 * 60 * 1000).toISOString(),
    priorMonthStart: new Date(ms - 60 * 24 * 60 * 60 * 1000).toISOString(),
  };
}

export type ChartRange = "7d" | "30d" | "90d" | "12mo";

export const CHART_RANGE_OPTIONS: { value: ChartRange; label: string }[] = [
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "90d", label: "90 days" },
  { value: "12mo", label: "12 months" },
];

export function isChartRange(value: string): value is ChartRange {
  return value === "7d" || value === "30d" || value === "90d" || value === "12mo";
}

/** Granularity chosen per range so a chart never renders 365 daily points. */
export function granularityForRange(range: ChartRange): "day" | "week" | "month" {
  if (range === "7d" || range === "30d") return "day";
  if (range === "90d") return "week";
  return "month";
}

export function rangeToStartDate(range: ChartRange, now: Date = new Date()): Date {
  const ms = now.getTime();
  const days = range === "7d" ? 7 : range === "30d" ? 30 : range === "90d" ? 90 : 365;
  return new Date(ms - days * 24 * 60 * 60 * 1000);
}

export interface TimeSeriesPoint {
  /** Short axis label, e.g. "Aug 12", "Wk of Jul 28", "Aug 2026". */
  label: string;
  /** ISO date of the bucket start -- stable sort key / tooltip detail. */
  date: string;
  count: number;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function startOfWeek(d: Date): Date {
  const day = startOfDay(d);
  const diff = day.getDay(); // 0 (Sun) .. 6 (Sat)
  day.setDate(day.getDate() - diff);
  return day;
}
function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

const DAY_LABEL = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const MONTH_LABEL = new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "UTC" });

/**
 * Buckets a flat list of ISO timestamps into a zero-filled, chronologically
 * contiguous series from `start` to now -- every bucket in range appears
 * even with a count of 0, so a chart never silently skips a quiet day. The
 * caller fetches only the timestamp column for rows already scoped to the
 * organization and date range (bounded, small); this function does no I/O.
 */
export function bucketTimestamps(
  timestamps: readonly string[],
  granularity: "day" | "week" | "month",
  start: Date,
  end: Date = new Date(),
): TimeSeriesPoint[] {
  const bucketStart = granularity === "day" ? startOfDay : granularity === "week" ? startOfWeek : startOfMonth;
  const advance = (d: Date): Date => {
    const next = new Date(d);
    if (granularity === "day") next.setDate(next.getDate() + 1);
    else if (granularity === "week") next.setDate(next.getDate() + 7);
    else next.setMonth(next.getMonth() + 1);
    return next;
  };
  const label = (d: Date): string =>
    granularity === "month" ? MONTH_LABEL.format(d) : granularity === "week" ? `Wk of ${DAY_LABEL.format(d)}` : DAY_LABEL.format(d);

  const buckets: TimeSeriesPoint[] = [];
  const keyToIndex = new Map<string, number>();
  let cursor = bucketStart(start);
  const endBucket = bucketStart(end);
  // Cap defensively -- a caller passing a huge range would otherwise loop
  // unbounded; 400 buckets already exceeds every real range this app offers.
  for (let i = 0; i < 400 && cursor.getTime() <= endBucket.getTime(); i++) {
    const key = cursor.toISOString();
    keyToIndex.set(key, buckets.length);
    buckets.push({ label: label(cursor), date: key, count: 0 });
    cursor = advance(cursor);
  }

  for (const ts of timestamps) {
    const bucketed = bucketStart(new Date(ts)).toISOString();
    const index = keyToIndex.get(bucketed);
    if (index !== undefined) buckets[index].count += 1;
  }

  return buckets;
}

import type { OrganizationRole } from "@/lib/auth/types";
import { getRollingBoundaries } from "./time-ranges";

export interface MemberStats {
  total: number;
  owners: number;
  admins: number;
  members: number;
  newToday: number;
  recentlyAdded: number;
  newThisMonth: number;
}

/**
 * Pure aggregation over an already-fetched member roster -- both
 * app/dashboard/role-management/page.tsx and
 * app/dashboard/settings/organization/members/page.tsx already call
 * getOrganizationMembers() and have the full list (with real joinedAt
 * timestamps) in hand before this runs, so this needs zero additional
 * database queries. Never call this with a partial/paginated list -- the
 * counts would silently undercount.
 */
export function computeMemberStats(members: readonly { role: OrganizationRole; joinedAt: string }[]): MemberStats {
  const { startOfToday, startOfWeek, startOfMonth } = getRollingBoundaries();

  let owners = 0;
  let admins = 0;
  let plainMembers = 0;
  let newToday = 0;
  let recentlyAdded = 0;
  let newThisMonth = 0;

  for (const member of members) {
    if (member.role === "owner") owners += 1;
    else if (member.role === "admin") admins += 1;
    else plainMembers += 1;

    if (member.joinedAt >= startOfToday) newToday += 1;
    if (member.joinedAt >= startOfWeek) recentlyAdded += 1;
    if (member.joinedAt >= startOfMonth) newThisMonth += 1;
  }

  return {
    total: members.length,
    owners,
    admins,
    members: plainMembers,
    newToday,
    recentlyAdded,
    newThisMonth,
  };
}

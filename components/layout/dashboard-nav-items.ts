import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Inbox,
  Settings,
  Tags,
  UserCog,
  Users,
} from "lucide-react";

export interface DashboardNavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

/**
 * Shared between the desktop sidebar and the mobile nav sheet so the two
 * surfaces can never drift out of sync.
 */
export const dashboardNavItems: DashboardNavItem[] = [
  { label: "Submissions", href: "/dashboard", icon: Inbox },
  { label: "Categories", href: "/dashboard/categories", icon: Tags },
  { label: "Customers", href: "/dashboard/customers", icon: Users },
  { label: "Members", href: "/dashboard/members", icon: UserCog },
  { label: "Analytics", href: "/dashboard/analytics", icon: BarChart3 },
  { label: "Settings", href: "/dashboard/settings", icon: Settings },
];

"use client";

import { useTransition } from "react";
import { Bell } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { markAllNotificationsRead } from "./actions";
import { NotificationList } from "./notification-list";
import type { Notification } from "./queries";

interface NotificationBellProps {
  notifications: Notification[];
  unreadCount: number;
  /** True only for a genuine load failure -- never conflated with "zero notifications". */
  error?: boolean;
}

export function NotificationBell({ notifications, unreadCount, error = false }: NotificationBellProps) {
  const [isPending, startTransition] = useTransition();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
        >
          <Bell className="size-4" aria-hidden="true" />
          {unreadCount > 0 ? (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-4 min-w-4 justify-center rounded-full px-1 text-[10px] leading-none"
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </Badge>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="text-sm font-medium text-foreground">Notifications</span>
          {unreadCount > 0 ? (
            <Button
              variant="ghost"
              size="xs"
              disabled={isPending}
              onClick={() =>
                startTransition(async () => {
                  const result = await markAllNotificationsRead();
                  if (!result.ok) toast.error(result.message ?? "Something went wrong.");
                })
              }
            >
              {isPending ? "Marking…" : "Mark all read"}
            </Button>
          ) : null}
        </div>
        {error ? (
          <p className="px-3 py-8 text-center text-sm text-destructive">
            Couldn&apos;t load notifications. Try again shortly.
          </p>
        ) : (
          <NotificationList notifications={notifications} />
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";

import { markNotificationRead } from "./actions";
import type { Notification } from "./queries";

/**
 * type/payload aren't populated by anything yet -- notification creation
 * is blocked by RLS (see service.ts) -- so this is a generic,
 * forward-compatible fallback rather than type-specific copy for events
 * that don't exist yet.
 */
function describeNotification(notification: Notification): string {
  return notification.type;
}

/**
 * Fixed locale and time zone, deliberately: this component is a Client
 * Component (it needs the mark-read click handler), so it's hydrated in
 * the browser after being server-rendered first. `toLocaleString()` with
 * no arguments uses each environment's own default locale/time zone --
 * the Node server's and the visitor's browser's are not guaranteed to
 * match, which produces a real React hydration mismatch. Pinning both
 * makes server and client output byte-identical.
 */
function formatNotificationTimestamp(createdAt: string): string {
  return new Date(createdAt).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  });
}

export function NotificationItem({ notification }: { notification: Notification }) {
  const [isPending, startTransition] = useTransition();
  const isUnread = notification.readAt === null;

  return (
    <button
      type="button"
      disabled={!isUnread || isPending}
      aria-label={isUnread ? `Mark "${describeNotification(notification)}" as read` : undefined}
      onClick={() =>
        startTransition(async () => {
          const result = await markNotificationRead(notification.id);
          if (!result.ok) toast.error(result.message ?? "Something went wrong.");
        })
      }
      className={cn(
        "flex w-full flex-col gap-0.5 border-b border-border px-3 py-2.5 text-left text-sm transition-colors last:border-b-0 hover:bg-muted/50 disabled:cursor-default disabled:hover:bg-transparent",
        isUnread && "bg-accent/40",
      )}
    >
      <span className="flex items-center gap-2 font-medium text-foreground">
        {isUnread ? (
          <span className="size-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
        ) : null}
        {describeNotification(notification)}
      </span>
      <span className="text-xs text-muted-foreground">
        {formatNotificationTimestamp(notification.createdAt)} UTC
      </span>
    </button>
  );
}

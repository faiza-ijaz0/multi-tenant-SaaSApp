import { NotificationItem } from "./notification-item";
import type { Notification } from "./queries";

export function NotificationList({ notifications }: { notifications: Notification[] }) {
  if (notifications.length === 0) {
    return (
      <p className="px-3 py-8 text-center text-sm text-muted-foreground">No notifications yet.</p>
    );
  }

  return (
    <div className="max-h-80 overflow-y-auto">
      {notifications.map((notification) => (
        <NotificationItem key={notification.id} notification={notification} />
      ))}
    </div>
  );
}

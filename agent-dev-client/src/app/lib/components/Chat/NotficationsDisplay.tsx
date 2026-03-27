import type { FC } from 'react';
import { observer } from 'mobx-react-lite';
import { useMessagingStore } from '@/app/lib/hooks/useMessagingStore';
import { NotificationTypes } from '@/app/lib/messaging/NotificationsStore';

/**
 * NotificationsDisplay component renders a fading stack of the most recent user
 * messages just above the input field using the NotificationStore.
 * Notifications are automatically added when users send messages and
 * removed after 25 seconds.
 */
export const NotificationsDisplay: FC = observer(() => {
  const { notificationsStore } = useMessagingStore();

  // Get the last 6 notifications (user message shadows)
  const visibleTexts = notificationsStore.lastNotifications
    .filter((notification) => notification.type === NotificationTypes.INFO) // Only show user message shadows
    .map((notification) => notification.message);

  if (visibleTexts.length === 0) {
    return null;
  }

  const MIN_OPACITY = 0.2;
  const MAX_OPACITY = 0.8;

  const calcOpacity = (idx: number, total: number) => {
    if (total === 1) {
      return MAX_OPACITY;
    }
    const step = (MAX_OPACITY - MIN_OPACITY) / (total - 1);
    return MIN_OPACITY + idx * step;
  };

  return (
    <div className="notifications-display absolute bottom-full right-4 mb-2 pointer-events-none w-full flex justify-end">
      <div className="flex flex-col items-end space-y-1 max-w-full">
        {visibleTexts.map((text, idx) => (
          <div
            key={`shadow-${idx}`}
            className="bg-primary text-primary-foreground px-3 py-2 rounded-lg text-sm max-w-full wrap-break-word text-right shadow-md"
            style={{
              opacity: calcOpacity(idx, visibleTexts.length),
              transition: 'opacity 0.3s ease-in-out',
            }}
          >
            {text}
          </div>
        ))}
      </div>
    </div>
  );
});

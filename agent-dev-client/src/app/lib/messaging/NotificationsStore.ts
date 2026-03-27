import { observable, action, computed } from 'mobx';

export const NotificationTypes = {
  SUCCESS: 'success',
  INFO: 'info',
  ERROR: 'error',
} as const;

export type NotificationTypeT = (typeof NotificationTypes)[keyof typeof NotificationTypes];

export interface NotificationParams {
  message: string;
  type: NotificationTypeT;
  delay?: number;
  title?: string;
  store: NotificationStore;
}

export interface AddNotificationParams {
  message: string;
  title?: string;
  type: NotificationTypeT;
  delay?: number;
}

export class Notification {
  readonly message: string;
  readonly type: NotificationTypeT;
  readonly title?: string;
  readonly delay?: number;
  readonly store: NotificationStore;

  constructor({ message, type, delay, title, store }: NotificationParams) {
    this.message = message;
    this.type = type;
    this.store = store;
    this.delay = delay;
    this.title = title;
  }

  @action.bound
  remove = () => {
    this.store.deleteNotification(this);
  };
}

export class NotificationStore {
  @observable accessor notifications: Notification[] = [];

  @computed
  get lastNotifications(): Notification[] {
    return this.notifications.slice(-6);
  }

  @action.bound
  addNotification = ({ message, title = '', type, delay = 0 }: AddNotificationParams) => {
    const notification = new Notification({
      message,
      type,
      title,
      delay,
      store: this,
    });

    this.notifications.push(notification);

    if (delay !== 0) {
      setTimeout(() => {
        this.deleteNotification(notification);
      }, delay);
    }
  };

  @action.bound
  deleteNotification = (notificationToDelete: Notification) => {
    this.notifications = this.notifications.filter(
      (notification) => notification !== notificationToDelete,
    );
  };
}

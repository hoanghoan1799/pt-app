// Clearing shown chat notifications once the reader is in that conversation
// (Hoan, 2026-11-09): the push tags are per conversation, so the open thread
// closes every notification with its tags. Best effort: browsers without
// service workers or getNotifications (and any error) just do nothing.

export const chatNotificationTags = (conversationId: number) => [
  `chat-${conversationId}`,
  `chat-react-${conversationId}`,
];

export const dmNotificationTags = (conversationId: number) => [
  `dm-${conversationId}`,
];

interface ClosableNotification {
  close: () => void;
}

interface NotificationRegistration {
  getNotifications?: (filter: {
    tag: string;
  }) => Promise<readonly ClosableNotification[]>;
}

export interface NotificationContainer {
  getRegistration: () => Promise<NotificationRegistration | undefined>;
}

const browserContainer = (): NotificationContainer | undefined =>
  typeof navigator !== "undefined" && "serviceWorker" in navigator
    ? (navigator.serviceWorker as unknown as NotificationContainer)
    : undefined;

export const clearNotifications = async (
  tags: readonly string[],
  container: NotificationContainer | undefined = browserContainer(),
) => {
  try {
    if (!container || tags.length === 0) {
      return;
    }
    const registration = await container.getRegistration();

    if (!registration?.getNotifications) {
      return;
    }
    const lists = await Promise.all(
      tags.map((tag) => registration.getNotifications!({ tag })),
    );

    for (const list of lists) {
      for (const notification of list) {
        notification.close();
      }
    }
  } catch {
    // A notification left on screen is harmless.
  }
};

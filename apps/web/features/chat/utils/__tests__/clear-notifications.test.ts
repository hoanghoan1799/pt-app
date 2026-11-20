import { describe, expect, it, vi } from "vitest";

import {
  chatNotificationTags,
  clearNotifications,
  dmNotificationTags,
  groupNotificationTags,
} from "@/features/chat/utils/clear-notifications";

const shown = (tags: Record<string, number>) => {
  const closed: string[] = [];
  const getNotifications = vi.fn(async ({ tag }: { tag: string }) =>
    Array.from({ length: tags[tag] ?? 0 }, (_, index) => ({
      close: () => closed.push(`${tag}#${index}`),
    })),
  );

  return {
    closed,
    getNotifications,
    container: { getRegistration: async () => ({ getNotifications }) },
  };
};

describe("notification tags", () => {
  it("match the push payload tags of a conversation", () => {
    expect(chatNotificationTags(7)).toEqual(["chat-7", "chat-react-7"]);
    expect(dmNotificationTags(7)).toEqual(["dm-7"]);
    expect(groupNotificationTags(7)).toEqual(["chat-group-7"]);
  });
});

describe("clearNotifications", () => {
  it("closes every notification with the given tags and no others", async () => {
    const fake = shown({ "chat-7": 2, "chat-react-7": 1, "chat-8": 1 });

    await clearNotifications(chatNotificationTags(7), fake.container);

    expect(fake.closed).toEqual(["chat-7#0", "chat-7#1", "chat-react-7#0"]);
    expect(fake.getNotifications).toHaveBeenCalledTimes(2);
  });

  it("does nothing without a container, a registration or getNotifications", async () => {
    await expect(clearNotifications(["dm-1"], undefined)).resolves.toBe(
      undefined,
    );
    await expect(
      clearNotifications(["dm-1"], { getRegistration: async () => undefined }),
    ).resolves.toBe(undefined);
    await expect(
      clearNotifications(["dm-1"], { getRegistration: async () => ({}) }),
    ).resolves.toBe(undefined);
  });

  it("swallows errors from the browser", async () => {
    await expect(
      clearNotifications(["dm-1"], {
        getRegistration: async () => {
          throw new Error("denied");
        },
      }),
    ).resolves.toBe(undefined);
  });
});

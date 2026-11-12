import type { PushPayload } from "@pt/contracts";
import { describe, expect, it, vi } from "vitest";

import { Clock } from "../common/clock.js";
import { PUSH_MAX_ATTEMPTS, PushService } from "./push.service.js";
import type {
  PushSender,
  PushSendResult,
  StoredPushSubscription,
} from "./push-sender.js";
import type { PushSubscriptionStore } from "./push-subscription.store.js";

const payload: PushPayload = {
  title: "An",
  body: "hello",
  url: "/messages/coach",
  tag: "chat-1",
};

const sub = (
  id: number,
  kind: StoredPushSubscription["kind"] = "web",
): StoredPushSubscription => ({
  id,
  ownerKey: "user:1",
  kind,
  endpoint: `https://fcm.googleapis.com/fcm/send/${id}`,
  p256dh: "p",
  auth: "a",
});

class TestClock extends Clock {
  readonly sleeps: number[] = [];

  override now() {
    return new Date("2026-11-12T10:00:00.000Z");
  }

  override sleep(ms: number) {
    this.sleeps.push(ms);
    return Promise.resolve();
  }
}

const logger = { error: vi.fn(), warn: vi.fn() };

const setup = (
  subscriptions: StoredPushSubscription[],
  senders: PushSender[],
) => {
  const store = {
    listFor: vi.fn().mockResolvedValue(subscriptions),
    delete: vi.fn().mockResolvedValue(undefined),
    markSuccess: vi.fn().mockResolvedValue(undefined),
    count: vi.fn().mockResolvedValue(subscriptions.length),
  };
  const clock = new TestClock();
  const service = new PushService(
    senders,
    store as unknown as PushSubscriptionStore,
    clock,
    logger as never,
  );

  return { service, store, clock };
};

const fake = (
  kind: PushSender["kind"],
  results: PushSendResult[],
  enabled = true,
) => {
  const queue = [...results];
  const send = vi.fn(() => Promise.resolve(queue.shift() ?? "ok"));

  return { kind, enabled, send } satisfies PushSender;
};

describe("PushService", () => {
  it("sends to every device of the owner and records the success", async () => {
    const web = fake("web", ["ok", "ok"]);
    const { service, store } = setup([sub(1), sub(2)], [web]);

    await service.sendToOwner("user:1", payload);

    expect(web.send).toHaveBeenCalledTimes(2);
    expect(web.send).toHaveBeenCalledWith(sub(1), payload);
    expect(store.markSuccess).toHaveBeenCalledWith(
      1,
      new Date("2026-11-12T10:00:00.000Z"),
    );
    expect(store.markSuccess).toHaveBeenCalledWith(
      2,
      new Date("2026-11-12T10:00:00.000Z"),
    );
    expect(store.delete).not.toHaveBeenCalled();
  });

  it("deletes a device that answers gone, and only that one", async () => {
    const web = fake("web", ["gone", "ok"]);
    const { service, store } = setup([sub(1), sub(2)], [web]);

    await service.sendToOwner("user:1", payload);

    expect(store.delete).toHaveBeenCalledTimes(1);
    expect(store.delete).toHaveBeenCalledWith(1);
    expect(store.markSuccess).toHaveBeenCalledWith(2, expect.any(Date));
  });

  it("retries a temporary failure with a growing wait, then succeeds", async () => {
    const web = fake("web", ["retry", "retry", "ok"]);
    const { service, store, clock } = setup([sub(1)], [web]);

    await service.sendToOwner("user:1", payload);

    expect(web.send).toHaveBeenCalledTimes(3);
    expect(clock.sleeps).toEqual([250, 500]);
    expect(store.markSuccess).toHaveBeenCalledWith(1, expect.any(Date));
  });

  it("gives up after the last attempt and keeps the device", async () => {
    const web = fake("web", ["retry", "retry", "retry", "retry"]);
    const { service, store } = setup([sub(1)], [web]);

    await service.sendToOwner("user:1", payload);

    expect(web.send).toHaveBeenCalledTimes(PUSH_MAX_ATTEMPTS);
    expect(store.delete).not.toHaveBeenCalled();
    expect(store.markSuccess).not.toHaveBeenCalled();
  });

  it("deletes a device that turns gone on a retry", async () => {
    const web = fake("web", ["retry", "gone"]);
    const { service, store } = setup([sub(1)], [web]);

    await service.sendToOwner("user:1", payload);

    expect(web.send).toHaveBeenCalledTimes(2);
    expect(store.delete).toHaveBeenCalledWith(1);
  });

  it("does not retry a refusal a retry cannot fix", async () => {
    const web = fake("web", ["failed"]);
    const { service, store } = setup([sub(1)], [web]);

    await service.sendToOwner("user:1", payload);

    expect(web.send).toHaveBeenCalledTimes(1);
    expect(store.delete).not.toHaveBeenCalled();
  });

  it("dispatches each device to the sender of its kind", async () => {
    const web = fake("web", ["ok"]);
    const expo = fake("expo", ["ok"]);
    const { service } = setup([sub(1, "web"), sub(2, "expo")], [web, expo]);

    await service.sendToOwner("user:1", payload);

    expect(web.send).toHaveBeenCalledWith(sub(1, "web"), payload);
    expect(expo.send).toHaveBeenCalledWith(sub(2, "expo"), payload);
    expect(web.send).toHaveBeenCalledTimes(1);
    expect(expo.send).toHaveBeenCalledTimes(1);
  });

  it("leaves a device alone when its kind has no sender or is switched off", async () => {
    const off = fake("web", ["ok"], false);
    const { service, store } = setup([sub(1, "web"), sub(2, "fcm")], [off]);

    await service.sendToOwner("user:1", payload);

    expect(off.send).not.toHaveBeenCalled();
    expect(store.delete).not.toHaveBeenCalled();
  });

  it("survives a sender that throws and still serves the other devices", async () => {
    const web = {
      kind: "web" as const,
      enabled: true,
      send: vi
        .fn()
        .mockRejectedValueOnce(new Error("boom"))
        .mockResolvedValue("ok"),
    };
    const { service, store } = setup([sub(1), sub(2)], [web]);

    await expect(
      service.sendToOwner("user:1", payload),
    ).resolves.toBeUndefined();
    expect(store.markSuccess).toHaveBeenCalledWith(2, expect.any(Date));
  });

  it("is enabled only when some sender is", () => {
    expect(setup([], [fake("web", [], false)]).service.isEnabled()).toBe(false);
    expect(setup([], [fake("web", [], true)]).service.isEnabled()).toBe(true);
    expect(
      setup([], [fake("web", [], true)]).service.isKindEnabled("fcm"),
    ).toBe(false);
  });
});

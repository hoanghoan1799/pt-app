import { describe, expect, it } from "vitest";

import type { Env } from "../../config/env.schema.js";
import { shouldPushReaction } from "../push.notifier.js";
import { classifyWebPushError, WebPushSender } from "./web-push.sender.js";

describe("classifyWebPushError", () => {
  it("treats 404 and 410 as a dead subscription", () => {
    expect(classifyWebPushError({ statusCode: 404 })).toBe("gone");
    expect(classifyWebPushError({ statusCode: 410 })).toBe("gone");
  });

  it("retries a throttle, a server error and a network failure", () => {
    expect(classifyWebPushError({ statusCode: 429 })).toBe("retry");
    expect(classifyWebPushError({ statusCode: 503 })).toBe("retry");
    expect(classifyWebPushError(new Error("ECONNRESET"))).toBe("retry");
  });

  it("does not retry a refusal", () => {
    expect(classifyWebPushError({ statusCode: 400 })).toBe("failed");
    expect(classifyWebPushError({ statusCode: 401 })).toBe("failed");
    expect(classifyWebPushError({ statusCode: 403 })).toBe("failed");
  });
});

describe("WebPushSender", () => {
  const env = (vapid: Partial<Env>) => vapid as Env;

  it("is disabled unless all three VAPID variables are set", () => {
    expect(new WebPushSender(env({})).enabled).toBe(false);
    expect(
      new WebPushSender(env({ VAPID_PUBLIC_KEY: "a", VAPID_PRIVATE_KEY: "b" }))
        .enabled,
    ).toBe(false);
    expect(
      new WebPushSender(
        env({
          VAPID_PUBLIC_KEY: "a",
          VAPID_PRIVATE_KEY: "b",
          VAPID_SUBJECT: "mailto:a@example.com",
        }),
      ).enabled,
    ).toBe(true);
  });

  it("sends nothing when disabled", async () => {
    const result = await new WebPushSender(env({})).send(
      {
        id: 1,
        ownerKey: "user:1",
        kind: "web",
        endpoint: "https://fcm.googleapis.com/x",
        p256dh: "p",
        auth: "a",
      },
      { title: "t", body: "b", url: "/", tag: "x" },
    );

    expect(result).toBe("failed");
  });
});

describe("shouldPushReaction", () => {
  const now = new Date("2026-11-12T10:00:00Z");

  it("pushes the first reaction and at most one an hour after", () => {
    expect(shouldPushReaction(null, now)).toBe(true);
    expect(shouldPushReaction(new Date("2026-11-12T09:30:00Z"), now)).toBe(
      false,
    );
    expect(shouldPushReaction(new Date("2026-11-12T09:00:00Z"), now)).toBe(
      true,
    );
  });
});

import {
  isAllowedPushEndpoint,
  pushSubscribeRequestSchema,
  pushUnsubscribeRequestSchema,
  realtimePresencePeerQuerySchema,
  realtimeSubscribeRequestSchema,
  realtimeTypingRequestSchema,
} from "../index.js";
import { describe, expect, it } from "vitest";

const keys = { p256dh: "p", auth: "a" };

describe("isAllowedPushEndpoint", () => {
  it("accepts the browsers' push services and their subdomains over https", () => {
    for (const url of [
      "https://fcm.googleapis.com/fcm/send/abc",
      "https://updates.push.services.mozilla.com/wpush/v2/abc",
      "https://web.push.apple.com/abc",
      "https://wns2-par02p.notify.windows.com/w/?token=abc",
    ]) {
      expect(isAllowedPushEndpoint(url), url).toBe(true);
    }
  });

  it("refuses everything else: other hosts, http, ports, credentials, look-alikes", () => {
    for (const url of [
      "https://example.com/push",
      "http://fcm.googleapis.com/x",
      "https://fcm.googleapis.com:8443/x",
      "https://user@fcm.googleapis.com/x",
      "https://evilfcm.googleapis.com.example.com/x",
      "https://notfcm.googleapis.com.evil/x",
      "https://localhost/x",
      "not a url",
    ]) {
      expect(isAllowedPushEndpoint(url), url).toBe(false);
    }
  });
});

describe("pushSubscribeRequestSchema", () => {
  const endpoint = "https://fcm.googleapis.com/fcm/send/abc";

  it("defaults the kind to web", () => {
    expect(pushSubscribeRequestSchema.parse({ endpoint, keys })).toEqual({
      kind: "web",
      endpoint,
      keys,
    });
  });

  it("refuses kinds that have no sender yet, bad hosts and missing keys", () => {
    expect(
      pushSubscribeRequestSchema.safeParse({ kind: "expo", endpoint, keys })
        .success,
    ).toBe(false);
    expect(
      pushSubscribeRequestSchema.safeParse({
        endpoint: "https://example.com/x",
        keys,
      }).success,
    ).toBe(false);
    expect(
      pushSubscribeRequestSchema.safeParse({ endpoint, keys: { p256dh: " " } })
        .success,
    ).toBe(false);
  });

  it("needs an endpoint to unsubscribe", () => {
    expect(pushUnsubscribeRequestSchema.safeParse({}).success).toBe(false);
    expect(pushUnsubscribeRequestSchema.parse({ endpoint })).toEqual({
      endpoint,
    });
  });
});

describe("realtime requests", () => {
  it("wants a positive conversation id to follow", () => {
    expect(realtimeSubscribeRequestSchema.parse({ conversationId: 3 })).toEqual(
      { conversationId: 3 },
    );
    for (const bad of [{}, { conversationId: 0 }, { conversationId: "3" }]) {
      expect(realtimeSubscribeRequestSchema.safeParse(bad).success).toBe(false);
    }
  });

  it("lets a typing event omit the conversation", () => {
    expect(realtimeTypingRequestSchema.parse({})).toEqual({});
    expect(
      realtimeTypingRequestSchema.safeParse({ conversationId: -1 }).success,
    ).toBe(false);
  });

  it("reads the peer query's userId as a number", () => {
    expect(realtimePresencePeerQuerySchema.parse({ userId: "7" })).toEqual({
      userId: 7,
    });
    expect(realtimePresencePeerQuerySchema.parse({})).toEqual({});
  });
});

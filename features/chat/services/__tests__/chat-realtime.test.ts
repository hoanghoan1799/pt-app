import { beforeEach, describe, expect, it, vi } from "vitest";

const ably = vi.hoisted(() => ({
  publish: vi.fn<
    (channel: string, event: string, data: unknown) => Promise<void>
  >(async () => undefined),
  get: vi.fn(),
  createTokenRequest: vi.fn(async (params: unknown) => ({ signed: params })),
  ctor: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("ably", () => ({
  Rest: class {
    channels = { get: ably.get };
    auth = { createTokenRequest: ably.createTokenRequest };
    constructor(options: unknown) {
      ably.ctor(options);
    }
  },
}));

const realtime = await import("@/features/chat/services/chat-realtime");

const message = {
  id: 9,
  senderRole: "user" as const,
  senderAdminId: null,
  body: "secret body",
  clientId: "c1",
  createdAt: new Date("2026-11-04T10:00:00.000Z"),
};

beforeEach(() => {
  vi.restoreAllMocks();
  ably.publish.mockReset().mockResolvedValue(undefined);
  ably.get.mockReset().mockImplementation((name: string) => ({
    publish: (event: string, data: unknown) => ably.publish(name, event, data),
  }));
  ably.ctor.mockReset();
  realtime.resetChatRealtimeForTests();
  vi.stubEnv("ABLY_API_KEY", "test.key:secret");
});

describe("without a key", () => {
  beforeEach(() => {
    vi.stubEnv("ABLY_API_KEY", "");
  });

  it("no-ops, warns once, and returns no token request", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await realtime.publishNewMessage(5, message);
    await realtime.publishRead(5, "user", 9);

    expect(ably.ctor).not.toHaveBeenCalled();
    expect(ably.publish).not.toHaveBeenCalled();
    expect(realtime.isRealtimeConfigured()).toBe(false);
    await expect(
      realtime.createChatTokenRequest({ clientId: "user:1", capability: {} }),
    ).resolves.toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      "[pt-app] ABLY_API_KEY missing: chat uses polling only",
    );
  });
});

describe("with a key", () => {
  it("never throws when publish rejects, and logs without the body", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    ably.publish.mockRejectedValue(new Error("ably down"));

    await expect(
      realtime.publishNewMessage(5, message),
    ).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledTimes(2);
    const logged = error.mock.calls.map((call) => call.join(" ")).join("\n");

    expect(logged).toContain("publishChatEvent");
    expect(logged).toContain("chat:conversation:5");
    expect(logged).not.toContain("secret body");
  });

  it("never throws on an invalid conversation id", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      realtime.publishNewMessage(0, message),
    ).resolves.toBeUndefined();
    expect(ably.publish).not.toHaveBeenCalled();
  });

  it("publishes a message on the conversation and a body-free inbox event", async () => {
    await realtime.publishNewMessage(5, message);

    expect(ably.publish).toHaveBeenCalledTimes(2);
    expect(ably.publish).toHaveBeenCalledWith(
      "chat:conversation:5",
      "message",
      {
        id: 9,
        conversationId: 5,
        senderRole: "user",
        senderAdminId: null,
        body: "secret body",
        clientId: "c1",
        createdAt: "2026-11-04T10:00:00.000Z",
      },
    );
    expect(ably.publish).toHaveBeenCalledWith("chat:inbox", "inbox", {
      conversationId: 5,
      messageId: 9,
      senderRole: "user",
    });
  });

  it("publishes read cursors on the conversation channel", async () => {
    await realtime.publishRead(5, "admin:7", 12);

    expect(ably.publish).toHaveBeenCalledExactlyOnceWith(
      "chat:conversation:5",
      "read",
      { readerKey: "admin:7", lastReadMessageId: 12 },
    );
  });

  it("publishes status on the user channel and the conversation if any", async () => {
    await realtime.publishChatStatus(3, 5, false);
    expect(ably.publish).toHaveBeenCalledTimes(2);
    expect(ably.publish).toHaveBeenCalledWith("chat:user:3", "chat-status", {
      enabled: false,
    });
    expect(ably.publish).toHaveBeenCalledWith(
      "chat:conversation:5",
      "chat-status",
      { enabled: false },
    );

    ably.publish.mockClear();
    await realtime.publishChatStatus(3, null, true);
    expect(ably.publish).toHaveBeenCalledExactlyOnceWith(
      "chat:user:3",
      "chat-status",
      { enabled: true },
    );
  });

  it("signs a token request locally with the capability and ttl", async () => {
    const result = await realtime.createChatTokenRequest({
      clientId: "user:3",
      capability: { "chat:user:3": ["subscribe"] },
    });

    expect(ably.ctor).toHaveBeenCalledWith({ key: "test.key:secret" });
    expect(result).toEqual({
      signed: {
        clientId: "user:3",
        capability: '{"chat:user:3":["subscribe"]}',
        ttl: 900000,
      },
    });
  });
});

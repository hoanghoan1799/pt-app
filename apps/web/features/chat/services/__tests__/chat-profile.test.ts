import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createTestDb, type TestDb } from "@/db/__tests__/create-test-db";
import {
  admins,
  chatColorOverrides,
  chatConversations,
  contactAliases,
  users,
} from "@/db/schema";
import { CHAT_MESSAGES } from "@/features/chat/constants/messages";

const state = vi.hoisted(() => ({
  db: null as unknown,
  role: "user" as "user" | "admin",
  userId: 1,
  adminId: 1,
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/features/chat/services/chat-realtime", () => ({
  publishProfileUpdate: vi.fn(async () => undefined),
}));
vi.mock("@/services/session", () => ({
  readSession: vi.fn(async () =>
    state.role === "admin"
      ? { role: "admin", adminId: state.adminId }
      : { role: "user", userId: state.userId },
  ),
}));
vi.mock("@/services/admins", () => ({
  findAdminById: vi.fn(async (id: number) => ({ id, username: `pt${id}` })),
}));
vi.mock("@/services/auth-guard", async () => {
  const { eq: equals } = await import("drizzle-orm");
  const { users: usersTable } = await import("@/db/schema");

  return {
    requireUser: vi.fn(async () => {
      const [row] = await (state.db as TestDb)
        .select()
        .from(usersTable)
        .where(equals(usersTable.id, state.userId));

      return row;
    }),
    requireAdmin: vi.fn(async () => ({
      id: state.adminId,
      username: `pt${state.adminId}`,
    })),
    getApiUser: vi.fn(async () => {
      const [row] = await (state.db as TestDb)
        .select()
        .from(usersTable)
        .where(equals(usersTable.id, state.userId));

      return row ?? null;
    }),
    getApiAdmin: vi.fn(async () => ({ id: state.adminId })),
  };
});
vi.mock("@/services/users", async () => {
  const { eq: equals } = await import("drizzle-orm");
  const { users: usersTable } = await import("@/db/schema");

  return {
    findUserById: vi.fn(async (id: number) => {
      const [row] = await (state.db as TestDb)
        .select()
        .from(usersTable)
        .where(equals(usersTable.id, id));

      return row ?? null;
    }),
  };
});
vi.mock("@/db", () => ({
  db: new Proxy(
    {},
    { get: (_target, property) => Reflect.get(state.db as object, property) },
  ),
}));

const actions = await import("@/features/chat/services/chat-profile-actions");
const realtime = await import("@/features/chat/services/chat-realtime");
const queries = await import("@/features/chat/services/chat-queries");
const userRoute = await import("@/app/api/chat/messages/route");
const adminRoute =
  await import("@/app/api/admin/chat/[conversationId]/messages/route");

let db: TestDb;
let userId: number;
let otherUserId: number;
let conversationId: number;
let otherConversationId: number;

const get = (path: string) => new NextRequest(`http://localhost${path}`);
const cursor = async (id = conversationId) =>
  (
    await db
      .select()
      .from(chatConversations)
      .where(eq(chatConversations.id, id))
  )[0].lastChangeAt;

const asUser = () => {
  state.role = "user";
  state.userId = userId;
};
const asAdmin = (id = 1) => {
  state.role = "admin";
  state.adminId = id;
};

beforeEach(async () => {
  vi.clearAllMocks();
  db = await createTestDb();
  state.db = db;
  await db.insert(admins).values([
    { username: "pt1", usernameKey: "pt1", passwordHash: "x" },
    { username: "pt2", usernameKey: "pt2", passwordHash: "x" },
  ]);
  // Two trainees with the same display name (names are not unique keys).
  const rows = await db
    .insert(users)
    .values([
      { name: "An", nameKey: "an", chatEnabled: true },
      { name: "An", nameKey: "an-2", chatEnabled: true },
    ])
    .returning({ id: users.id });

  userId = rows[0].id;
  otherUserId = rows[1].id;
  conversationId = (await queries.getOrCreateConversation(userId)).id;
  otherConversationId = (await queries.getOrCreateConversation(otherUserId)).id;
  asUser();
});

describe("loadAdminAccountColor", () => {
  it("returns the saved account colour, null when unset or unknown", async () => {
    const profile = await import("@/features/chat/services/chat-profile");

    expect(await profile.loadAdminAccountColor(1)).toBeNull();
    await db.update(admins).set({ chatColor: "teal" }).where(eq(admins.id, 1));
    expect(await profile.loadAdminAccountColor(1)).toBe("teal");
    expect(await profile.loadAdminAccountColor(2)).toBeNull();
    await db.update(admins).set({ chatColor: "mauve" }).where(eq(admins.id, 1));
    expect(await profile.loadAdminAccountColor(1)).toBeNull();
    expect(await profile.loadAdminAccountColor(999)).toBeNull();
  });
});

describe("colours", () => {
  it("saves the trainee's own colour and clears it with null", async () => {
    const set = await actions.setChatColorAction({ color: "teal" });

    expect(set).toMatchObject({
      status: "success",
      profile: { colors: { user: "teal" } },
    });
    expect(realtime.publishProfileUpdate).toHaveBeenCalledWith(conversationId);

    const cleared = await actions.setChatColorAction({ color: null });

    expect(cleared).toMatchObject({ profile: { colors: {} } });
    const [row] = await db.select().from(users).where(eq(users.id, userId));

    expect(row.chatColor).toBeNull();
  });

  it.each([
    ["a hex value", { color: "#ff0000" }],
    ["an unknown key", { color: "magenta" }],
    ["a number", { color: 3 }],
    ["no colour field", {}],
    ["null input", null],
  ])("rejects an invalid colour: %s", async (_label, input) => {
    const result = await actions.setChatColorAction(
      input as { color: string | null },
    );

    expect(result).toEqual({
      status: "error",
      message: CHAT_MESSAGES.COLOR_INVALID,
    });
    const [row] = await db.select().from(users).where(eq(users.id, userId));

    expect(row.chatColor).toBeNull();
  });

  it("does not touch another trainee's colour", async () => {
    await actions.setChatColorAction({ color: "red" });
    const [other] = await db
      .select()
      .from(users)
      .where(eq(users.id, otherUserId));

    expect(other.chatColor).toBeNull();
  });

  it("saves an admin's account colour and tells every conversation", async () => {
    asAdmin(1);
    const result = await actions.adminSetChatColorAction({ color: "purple" });

    expect(result).toEqual({ status: "success" });
    const [row] = await db.select().from(admins).where(eq(admins.id, 1));

    expect(row.chatColor).toBe("purple");
    expect(await cursor()).not.toBeNull();
    expect(await cursor(otherConversationId)).not.toBeNull();
    expect(realtime.publishProfileUpdate).toHaveBeenCalledTimes(2);
    expect(
      await actions.adminSetChatColorAction({ color: "nope" }),
    ).toMatchObject({ status: "error", message: CHAT_MESSAGES.COLOR_INVALID });
  });

  it("lets an admin override their colour for one conversation only", async () => {
    asAdmin(1);
    await actions.adminSetChatColorAction({ color: "purple" });
    const result = await actions.adminSetConversationColorAction({
      conversationId,
      color: "green",
    });

    expect(result).toMatchObject({
      status: "success",
      profile: { colors: { "admin:1": "green" } },
    });
    expect(await db.select().from(chatColorOverrides)).toEqual([
      { conversationId, adminId: 1, color: "green" },
    ]);

    // Replaces, does not duplicate.
    await actions.adminSetConversationColorAction({
      conversationId,
      color: "blue",
    });
    expect(await db.select().from(chatColorOverrides)).toHaveLength(1);

    // Other conversation still shows the account colour.
    const other = await adminRoute.GET(
      get(`/api/admin/chat/${otherConversationId}/messages`),
      {
        params: Promise.resolve({
          conversationId: String(otherConversationId),
        }),
      },
    );

    expect((await other.json()).profile.colors).toEqual({
      "admin:1": "purple",
    });

    // Removing the override falls back to the account colour.
    const removed = await actions.adminSetConversationColorAction({
      conversationId,
      color: null,
    });

    expect(removed).toMatchObject({
      profile: { colors: { "admin:1": "purple" } },
    });
    expect(await db.select().from(chatColorOverrides)).toEqual([]);
  });

  it("validates the override input and the conversation", async () => {
    asAdmin();

    expect(
      await actions.adminSetConversationColorAction({
        conversationId,
        color: "#fff",
      }),
    ).toEqual({ status: "error", message: CHAT_MESSAGES.COLOR_INVALID });
    expect(
      await actions.adminSetConversationColorAction({
        conversationId: 9999,
        color: "red",
      }),
    ).toEqual({
      status: "error",
      message: CHAT_MESSAGES.CONVERSATION_NOT_FOUND,
    });
    expect(await db.select().from(chatColorOverrides)).toEqual([]);
  });
});

describe("payload", () => {
  const thread = async (query = "") => {
    const response = await userRoute.GET(
      get(`/api/chat/messages${query ? `?${query}` : ""}`),
    );

    return {
      status: response.status,
      body: response.status === 204 ? null : await response.json(),
    };
  };

  it("is empty before anything is set", async () => {
    expect((await thread()).body.profile).toEqual({
      nicknames: {},
      colors: {},
    });
  });

  it("gives both sides the same colours but each its OWN nicknames", async () => {
    const alias = (ownerKey: string, targetKey: string, value: string) => ({
      ownerKey,
      targetKey,
      alias: value,
      updatedAt: new Date(),
    });

    await db.insert(contactAliases).values([
      // Trainee: the PT side as a whole, one admin, and (ignored) themselves.
      alias(`user:${userId}`, "pt", "Thầy"),
      alias(`user:${userId}`, "admin:2", "Thầy Hai"),
      alias(`user:${userId}`, `user:${userId}`, "Tự gọi"),
      // Admin 1: the trainee, a colleague, and (ignored) themselves.
      alias("admin:1", `user:${userId}`, "Bé Na"),
      alias("admin:1", "admin:2", "Đồng nghiệp"),
      alias("admin:1", "admin:1", "Tôi"),
      // Admin 2 named the trainee of the other conversation only.
      alias("admin:2", `user:${otherUserId}`, "Bé Bình"),
    ]);
    await actions.setChatColorAction({ color: "blue" });
    asAdmin(1);
    await actions.adminSetChatColorAction({ color: "red" });
    asAdmin(2);
    await actions.adminSetConversationColorAction({
      conversationId,
      color: "green",
    });
    const colors = { user: "blue", "admin:1": "red", "admin:2": "green" };
    const viewAsAdmin = async (id: number) => {
      asAdmin(id);
      const response = await adminRoute.GET(
        get(`/api/admin/chat/${conversationId}/messages`),
        { params: Promise.resolve({ conversationId: String(conversationId) }) },
      );

      return (await response.json()).profile;
    };

    asUser();
    expect((await thread()).body.profile).toEqual({
      nicknames: { pt: "Thầy", "admin:2": "Thầy Hai" },
      colors,
    });
    expect(await viewAsAdmin(1)).toEqual({
      nicknames: { user: "Bé Na", "admin:2": "Đồng nghiệp" },
      colors,
    });
    // Admin 2 set nothing for this conversation: real names everywhere.
    expect(await viewAsAdmin(2)).toEqual({ nicknames: {}, colors });
  });

  it("ignores a stored colour key that is no longer in the palette", async () => {
    await db.update(users).set({ chatColor: "retired" });

    expect((await thread()).body.profile.colors).toEqual({});
  });

  it("does not move the change cursor when a nickname changes", async () => {
    const first = await thread();
    const known = `after=1&readUpTo=${first.body.peerReadUpTo}&enabled=1&changedSince=${first.body.lastChangeAt}`;

    expect((await thread(known)).status).toBe(204);
    await db.insert(contactAliases).values({
      ownerKey: `user:${userId}`,
      targetKey: "pt",
      alias: "Coach",
      updatedAt: new Date(),
    });

    // Nobody else's view changed, so nothing is announced; the owner's next
    // full payload (or a page refresh) carries the nickname.
    expect((await thread(known)).status).toBe(204);
    expect((await thread()).body.profile.nicknames).toEqual({ pt: "Coach" });
    expect(await cursor()).toBeNull();
    expect(realtime.publishProfileUpdate).not.toHaveBeenCalled();
  });
});

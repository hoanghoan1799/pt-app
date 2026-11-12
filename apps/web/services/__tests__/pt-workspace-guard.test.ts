import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { INITIAL_FORM_STATE } from "@/constants/form";
import { createTestDb, type TestDb } from "@/db/__tests__/create-test-db";
import {
  adminHiddenUsers,
  admins,
  chatConversations,
  chatMessages,
  nutritionTargets,
  users,
} from "@/db/schema";

const state = vi.hoisted(() => ({ db: null as unknown, adminId: 1 }));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/services/logger", () => ({ logServerError: vi.fn() }));
vi.mock("@/services/admin-lock", () => ({
  canSeeHiddenUsers: vi.fn(async () => false),
}));
vi.mock("@/features/chat/services/chat-realtime", () => ({
  publishNewMessage: vi.fn(async () => undefined),
  publishRead: vi.fn(async () => undefined),
  publishChatStatus: vi.fn(async () => undefined),
  publishMessageUpdate: vi.fn(async () => undefined),
  isRealtimeConfigured: () => true,
  createChatTokenRequest: vi.fn(async (input: unknown) => ({ signed: input })),
}));
vi.mock("@/features/chat/services/chat-push", () => ({
  schedulePush: vi.fn(),
  scheduleReactionPush: vi.fn(),
}));
vi.mock("@/services/auth-guard", () => ({
  requireAdmin: vi.fn(async () => ({ id: state.adminId, username: "x" })),
  requireUser: vi.fn(),
  getApiAdmin: vi.fn(async () => ({ id: state.adminId, role: "pt" })),
  getApiUser: vi.fn(async () => null),
}));
vi.mock("@/db", () => ({
  db: new Proxy(
    {},
    { get: (_target, property) => Reflect.get(state.db as object, property) },
  ),
}));

const nutrition =
  await import("@/features/nutrition/services/nutrition-actions");
const plans = await import("@/features/meal-plans/services/meal-plan-actions");
const chatAdmin = await import("@/features/chat/services/chat-admin-actions");
const chatProfile =
  await import("@/features/chat/services/chat-profile-actions");
const chatActions = await import("@/features/chat/services/chat-actions");
const chatHidden = await import("@/features/chat/services/chat-hidden");
const ablyRoute = await import("@/app/api/chat/ably-token/route");

let db: TestDb;
let ptA: number;
let ptB: number;
let mine: number;
let theirs: number;
let mineConversation: number;
let theirConversation: number;

const addAdmin = async (name: string) =>
  (
    await db
      .insert(admins)
      .values({
        username: name,
        usernameKey: name,
        passwordHash: "x",
        role: "pt",
      })
      .returning({ id: admins.id })
  )[0].id;

const addTrainee = async (name: string, ptAdminId: number) => {
  const [user] = await db
    .insert(users)
    .values({
      name,
      nameKey: name,
      email: `${name}@x.vn`,
      emailKey: `${name}@x.vn`,
      ptAdminId,
      chatEnabled: true,
    })
    .returning({ id: users.id });
  const [conversation] = await db
    .insert(chatConversations)
    .values({ userId: user.id })
    .returning({ id: chatConversations.id });

  await db.insert(chatMessages).values({
    conversationId: conversation.id,
    senderRole: "user",
    body: "hi",
    clientId: `c-${name}`,
    createdAt: new Date(),
  });
  return { userId: user.id, conversationId: conversation.id };
};

const form = (fields: Record<string, string>) => {
  const data = new FormData();

  for (const [key, value] of Object.entries(fields)) {
    data.set(key, value);
  }
  return data;
};

// "denied" when the guard sent the admin to a 404; otherwise the action ran.
const outcome = async (call: () => Promise<unknown>) => {
  try {
    await call();
    return "ran";
  } catch (error) {
    return String((error as { digest?: string }).digest).includes("404")
      ? "denied"
      : "ran";
  }
};

beforeEach(async () => {
  db = await createTestDb();
  state.db = db;
  ptA = await addAdmin("pta");
  ptB = await addAdmin("ptb");
  state.adminId = ptA;
  ({ userId: mine, conversationId: mineConversation } = await addTrainee(
    "mine",
    ptA,
  ));
  ({ userId: theirs, conversationId: theirConversation } = await addTrainee(
    "theirs",
    ptB,
  ));
});

describe("nutrition", () => {
  const save = (userId: number) =>
    outcome(() =>
      nutrition.saveNutritionTargetAction(
        INITIAL_FORM_STATE,
        form({
          userId: String(userId),
          carbs: "200",
          protein: "120",
          fat: "60",
        }),
      ),
    );

  it("saves targets only inside the workspace", async () => {
    expect(await save(mine)).toBe("ran");
    expect(await save(theirs)).toBe("denied");
    const rows = await db.select().from(nutritionTargets);

    expect(rows.map((row) => row.userId)).toEqual([mine]);
  });
});

describe("meal plans", () => {
  it("creates day plans only inside the workspace", async () => {
    const create = (userId: number) =>
      outcome(() => plans.createDayPlanAction({ userId, date: "2026-11-02" }));

    expect(await create(theirs)).toBe("denied");
    expect(await create(mine)).toBe("ran");
    expect(
      await outcome(() =>
        plans.deleteDayPlanAction({ userId: theirs, dayId: 1 }),
      ),
    ).toBe("denied");
  });
});

describe("chat", () => {
  it("setChatEnabled, read marks and nicknames are scoped", async () => {
    expect(
      await outcome(() => chatAdmin.setChatEnabledAction(theirs, false)),
    ).toBe("denied");
    expect(
      (await db.select().from(users).where(eq(users.id, theirs)))[0]
        .chatEnabled,
    ).toBe(true);
    await chatAdmin.setChatEnabledAction(mine, false);
    expect(
      (await db.select().from(users).where(eq(users.id, mine)))[0].chatEnabled,
    ).toBe(false);

    expect(
      await outcome(() =>
        chatActions.adminMarkReadAction({
          conversationId: theirConversation,
          lastReadMessageId: 1,
        }),
      ),
    ).toBe("denied");
    expect(
      await outcome(() =>
        chatActions.adminSendMessageAction({
          userId: theirs,
          clientId: "00000000-0000-4000-8000-000000000009",
          body: "hello",
        }),
      ),
    ).toBe("denied");
  });

  it("colour overrides are refused for another workspace", async () => {
    expect(
      await outcome(() =>
        chatProfile.adminSetConversationColorAction({
          conversationId: theirConversation,
          color: null,
        }),
      ),
    ).toBe("denied");
    expect(mineConversation).toBeGreaterThan(0);
  });

  it("hiding ignores trainees outside the workspace", async () => {
    await db
      .update(admins)
      .set({ passcodeHash: "hash" })
      .where(eq(admins.id, ptA));
    const result = await chatHidden.hideUsers(ptA, [mine, theirs]);

    expect(result).toEqual({ status: "success", hidden: 1 });
    expect(
      (await db.select().from(adminHiddenUsers)).map((row) => row.userId),
    ).toEqual([mine]);
  });
});

describe("realtime token", () => {
  it("scopes a PT's Ably capability to their conversations", async () => {
    const { NextRequest } = await import("next/server");
    const response = await ablyRoute.GET(
      new NextRequest("http://localhost/api/chat/ably-token?as=admin"),
    );

    expect(response.status).toBe(200);
    const { signed } = await response.json();

    expect(signed.capability).toEqual({
      [`chat:conversation:${mineConversation}`]: ["subscribe"],
      "chat:inbox": ["subscribe"],
    });
  });
});

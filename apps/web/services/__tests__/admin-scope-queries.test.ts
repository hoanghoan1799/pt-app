import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createTestDb, type TestDb } from "@/db/__tests__/create-test-db";
import {
  admins,
  chatConversations,
  chatMessages,
  exerciseCompletions,
  exercises,
  users,
  workoutDays,
} from "@/db/schema";

const state = vi.hoisted(() => ({ db: null as unknown }));

vi.mock("server-only", () => ({}));
vi.mock("@/db", () => ({
  db: new Proxy(
    {},
    { get: (_target, property) => Reflect.get(state.db as object, property) },
  ),
}));
vi.mock("@/services/admin-lock", () => ({
  canSeeHiddenUsers: vi.fn(async () => false),
}));

const chat = await import("@/features/chat/services/chat-queries");
const members = await import("@/features/members/services/member-queries");

let db: TestDb;
let superId: number;
let ptA: number;
let ptB: number;
let mine: number;
let theirs: number;

const addAdmin = async (name: string, role: "pt" | "super_admin") => {
  const [row] = await db
    .insert(admins)
    .values({ username: name, usernameKey: name, passwordHash: "x", role })
    .returning({ id: admins.id });

  return row.id;
};

// A trainee with an unread message and one completed exercise.
const addTrainee = async (name: string, ptAdminId: number) => {
  const [user] = await db
    .insert(users)
    .values({ name, nameKey: name, ptAdminId, chatEnabled: true })
    .returning({ id: users.id });
  const [conversation] = await db
    .insert(chatConversations)
    .values({ userId: user.id })
    .returning({ id: chatConversations.id });
  const [message] = await db
    .insert(chatMessages)
    .values({
      conversationId: conversation.id,
      senderRole: "user",
      body: "hi",
      clientId: `c-${name}`,
      createdAt: new Date(),
    })
    .returning({ id: chatMessages.id });

  await db
    .update(chatConversations)
    .set({ lastMessageId: message.id, lastMessageAt: new Date() })
    .where(eq(chatConversations.id, conversation.id));
  const [day] = await db
    .insert(workoutDays)
    .values({ userId: user.id, date: "2026-11-02" })
    .returning({ id: workoutDays.id });
  const [exercise] = await db
    .insert(exercises)
    .values({ dayId: day.id, title: `Squat ${name}`, youtubeId: "abc" })
    .returning({ id: exercises.id });

  await db.insert(exerciseCompletions).values({
    userId: user.id,
    exerciseId: exercise.id,
    completedAt: new Date(),
  });
  return user.id;
};

beforeEach(async () => {
  db = await createTestDb();
  state.db = db;
  superId = await addAdmin("boss", "super_admin");
  ptA = await addAdmin("pta", "pt");
  ptB = await addAdmin("ptb", "pt");
  mine = await addTrainee("mine", ptA);
  theirs = await addTrainee("theirs", ptB);
});

describe("P1 scope across admin lists", () => {
  it("member picker lists only the workspace, and ignores keepUserId outside it", async () => {
    expect((await members.listMembers(ptA)).map((row) => row.id)).toEqual([
      mine,
    ]);
    expect(
      (await members.listMembers(ptA, theirs)).map((row) => row.id),
    ).toEqual([mine]);
    expect((await members.listMembers(superId)).map((row) => row.id)).toEqual([
      mine,
      theirs,
    ]);
  });

  it("inbox and unread counts only cover the PT's trainees", async () => {
    const inbox = await chat.listAdminInbox(ptA);

    expect(inbox.conversations.map((item) => item.userId)).toEqual([mine]);
    expect(await chat.countUnreadForAdmin(ptA)).toBe(1);
    expect(
      (await chat.listUnreadByTraineeForAdmin(ptA)).map((row) => row.userId),
    ).toEqual([mine]);
    expect(await chat.countUnreadForAdmin(superId)).toBe(2);
  });
});

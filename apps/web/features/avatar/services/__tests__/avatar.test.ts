import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createTestDb, type TestDb } from "@/db/__tests__/create-test-db";
import { admins, chatConversations, users } from "@/db/schema";

const state = vi.hoisted(() => ({
  db: null as unknown,
  user: null as null | { id: number },
  admin: null as null | { id: number; username: string },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/db", () => ({
  db: new Proxy(
    {},
    { get: (_target, property) => Reflect.get(state.db as object, property) },
  ),
}));
// Whether the trainee has a conversation is the chat API's answer now; the
// route only asks. Here the answer comes from the test database.
vi.mock("@/features/chat/services/chat-queries", () => ({
  hasMyConversation: vi.fn(async () => {
    const rows = await (state.db as TestDb)
      .select()
      .from(chatConversations)
      .where(eq(chatConversations.userId, state.user?.id ?? 0));

    return rows.length > 0;
  }),
}));
vi.mock("@/services/auth-guard", () => ({
  getApiUser: vi.fn(async () => state.user),
  getApiAdmin: vi.fn(async () => state.admin),
  requireUser: vi.fn(async () => {
    if (!state.user) {
      throw new Error("NEXT_REDIRECT");
    }
    return state.user;
  }),
  requireAdmin: vi.fn(async () => {
    if (!state.admin) {
      throw new Error("NEXT_REDIRECT");
    }
    return state.admin;
  }),
}));

const route = await import("@/app/api/avatar/[kind]/[id]/route");
const actions = await import("@/features/avatar/services/avatar-actions");
const service = await import("@/features/avatar/services/avatar");

// A real 1x1 PNG.
const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const PNG_URL = `data:image/png;base64,${PNG_BASE64}`;

let db: TestDb;
let traineeId: number;
let otherTraineeId: number;
let adminId: number;

const get = (kind: string, id: number | string, query = "", headers = {}) =>
  route.GET(
    new NextRequest(`http://localhost/api/avatar/${kind}/${id}${query}`, {
      headers,
    }),
    { params: Promise.resolve({ kind, id: String(id) }) },
  );

const storedUser = async (id: number) =>
  (await db.select().from(users).where(eq(users.id, id)))[0];
const storedAdmin = async (id: number) =>
  (await db.select().from(admins).where(eq(admins.id, id)))[0];

beforeEach(async () => {
  db = await createTestDb();
  state.db = db;
  [{ id: traineeId }, { id: otherTraineeId }] = await db
    .insert(users)
    .values([
      { name: "An", nameKey: "an" },
      { name: "Binh", nameKey: "binh" },
    ])
    .returning({ id: users.id });
  [{ id: adminId }] = await db
    .insert(admins)
    .values({ username: "pt", usernameKey: "pt", passwordHash: "x" })
    .returning({ id: admins.id });
  state.user = { id: traineeId };
  state.admin = null;
});

describe("setUserAvatarAction / setAdminAvatarAction", () => {
  it("stores the viewer's own photo and returns its versioned URL", async () => {
    const result = await actions.setUserAvatarAction({ dataUrl: PNG_URL });

    expect(result).toEqual({
      status: "success",
      avatarUrl: expect.stringMatching(
        new RegExp(`^/api/avatar/user/${traineeId}\\?v=\\d+$`),
      ),
    });
    const row = await storedUser(traineeId);

    expect(row.avatar).toBe(PNG_URL);
    expect(row.avatarUpdatedAt).toBeInstanceOf(Date);
    // Only their own row.
    expect((await storedUser(otherTraineeId)).avatar).toBeNull();
  });

  it("stores an admin's photo on the admin row", async () => {
    state.user = null;
    state.admin = { id: adminId, username: "pt" };
    const result = await actions.setAdminAvatarAction({ dataUrl: PNG_URL });

    expect(result.status).toBe("success");
    expect((await storedAdmin(adminId)).avatar).toBe(PNG_URL);
  });

  it("rejects non-images, wrong labels, oversize and bad input without writing", async () => {
    const html = `data:image/png;base64,${Buffer.from("<script>1</script>").toString("base64")}`;
    const huge = `data:image/jpeg;base64,${Buffer.from([0xff, 0xd8, 0xff, ...new Array(90_000).fill(1)]).toString("base64")}`;

    for (const dataUrl of [html, "nope", "", huge]) {
      const result = await actions.setUserAvatarAction({ dataUrl });

      expect(result.status, dataUrl.slice(0, 20)).toBe("error");
    }
    expect(
      await actions.setUserAvatarAction({
        dataUrl: undefined as unknown as string,
      }),
    ).toMatchObject({ status: "error" });
    expect(await actions.setUserAvatarAction(undefined as never)).toMatchObject(
      { status: "error" },
    );
    expect((await storedUser(traineeId)).avatar).toBeNull();
    expect(await actions.setUserAvatarAction({ dataUrl: huge })).toMatchObject({
      message: expect.stringContaining("quá lớn"),
    });
  });

  it("requires a session of the right kind", async () => {
    state.user = null;
    await expect(
      actions.setUserAvatarAction({ dataUrl: PNG_URL }),
    ).resolves.toMatchObject({ status: "error" });
    await expect(
      actions.setAdminAvatarAction({ dataUrl: PNG_URL }),
    ).resolves.toMatchObject({ status: "error" });
    expect((await storedUser(traineeId)).avatar).toBeNull();
    expect((await storedAdmin(adminId)).avatar).toBeNull();
  });
});

describe("removeUserAvatarAction / removeAdminAvatarAction", () => {
  it("clears the photo and its version", async () => {
    await actions.setUserAvatarAction({ dataUrl: PNG_URL });
    const result = await actions.removeUserAvatarAction();

    expect(result).toEqual({ status: "success", avatarUrl: null });
    const row = await storedUser(traineeId);

    expect(row.avatar).toBeNull();
    expect(row.avatarUpdatedAt).toBeNull();
  });

  it("clears an admin's photo", async () => {
    state.user = null;
    state.admin = { id: adminId, username: "pt" };
    await actions.setAdminAvatarAction({ dataUrl: PNG_URL });
    await actions.removeAdminAvatarAction();

    expect((await storedAdmin(adminId)).avatar).toBeNull();
  });
});

describe("service lookups", () => {
  it("lists only admins who have a photo", async () => {
    expect((await service.listAdminAvatarUrls()).size).toBe(0);
    await service.saveAvatar("admin", adminId, PNG_URL);

    const urls = await service.listAdminAvatarUrls();

    expect(urls.get(adminId)).toMatch(/^\/api\/avatar\/admin\/\d+\?v=\d+$/);
    expect(await service.getAvatarUrl("user", traineeId)).toBeNull();
  });
});

describe("GET /api/avatar/[kind]/[id]", () => {
  beforeEach(async () => {
    await service.saveAvatar("user", traineeId, PNG_URL);
    await service.saveAvatar("admin", adminId, PNG_URL);
  });

  it("serves the bytes with the sniffed type and cache headers", async () => {
    const response = await get("user", traineeId);

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/png");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("Cache-Control")).toBe("private, no-cache");
    expect(response.headers.get("ETag")).toMatch(/^"\d+"$/);
    expect(Buffer.from(await response.arrayBuffer()).toString("base64")).toBe(
      PNG_BASE64,
    );
  });

  it("caches a year when the version matches and revalidates when it does not", async () => {
    const version = (await get("user", traineeId)).headers
      .get("ETag")!
      .replaceAll('"', "");

    expect(
      (await get("user", traineeId, `?v=${version}`)).headers.get(
        "Cache-Control",
      ),
    ).toBe("private, max-age=31536000, immutable");
    expect(
      (await get("user", traineeId, "?v=1")).headers.get("Cache-Control"),
    ).toBe("private, no-cache");
  });

  it("answers 304 on a matching ETag", async () => {
    const etag = (await get("user", traineeId)).headers.get("ETag")!;
    const response = await get("user", traineeId, "", {
      "if-none-match": etag,
    });

    expect(response.status).toBe(304);
    expect(response.headers.get("ETag")).toBe(etag);
  });

  it("401s without a session", async () => {
    state.user = null;

    expect((await get("user", traineeId)).status).toBe(401);
  });

  it("lets a trainee see their own photo, not another trainee's", async () => {
    await service.saveAvatar("user", otherTraineeId, PNG_URL);

    expect((await get("user", traineeId)).status).toBe(200);
    expect((await get("user", otherTraineeId)).status).toBe(404);
  });

  it("shows the PT team's photo only to a trainee with a conversation", async () => {
    expect((await get("admin", adminId)).status).toBe(404);
    await db.insert(chatConversations).values({ userId: traineeId });

    expect((await get("admin", adminId)).status).toBe(200);
  });

  it("lets any admin see any photo", async () => {
    state.user = null;
    state.admin = { id: adminId, username: "pt" };

    expect((await get("user", traineeId)).status).toBe(200);
    expect((await get("user", otherTraineeId)).status).toBe(404);
    expect((await get("admin", adminId)).status).toBe(200);
  });

  it("404s for a missing photo, unknown kinds and bad ids", async () => {
    state.user = null;
    state.admin = { id: adminId, username: "pt" };
    await service.clearAvatar("user", traineeId);

    expect((await get("user", traineeId)).status).toBe(404);
    expect((await get("root", 1)).status).toBe(404);
    expect((await get("user", "abc")).status).toBe(404);
    expect((await get("user", -1)).status).toBe(404);
  });

  it("does not serve a stored value that is not an image", async () => {
    state.user = null;
    state.admin = { id: adminId, username: "pt" };
    await db
      .update(users)
      .set({
        avatar: "data:image/png;base64,PHNjcmlwdD4=",
        avatarUpdatedAt: new Date(),
      })
      .where(eq(users.id, traineeId));

    expect((await get("user", traineeId)).status).toBe(404);
  });
});

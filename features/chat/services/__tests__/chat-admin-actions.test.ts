import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createTestDb, type TestDb } from "@/db/__tests__/create-test-db";
import { users } from "@/db/schema";

const state = vi.hoisted(() => ({
  db: null as unknown,
  role: "admin",
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/services/session", () => ({
  readSession: vi.fn(async () =>
    state.role === "admin"
      ? { role: "admin", adminId: 7 }
      : { role: "user", userId: 1 },
  ),
}));
vi.mock("@/services/admins", () => ({
  findAdminById: vi.fn(async (id: number) => ({ id, username: "pt" })),
}));
vi.mock("@/services/users", () => ({ findUserById: vi.fn() }));
vi.mock("@/db", () => ({
  db: new Proxy(
    {},
    { get: (_target, property) => Reflect.get(state.db as object, property) },
  ),
}));

const { revalidatePath } = await import("next/cache");
const { setChatEnabledAction } =
  await import("@/features/chat/services/chat-admin-actions");

let db: TestDb;
let userId: number;

const loadUser = async (id = userId) => {
  const [row] = await db.select().from(users).where(eq(users.id, id));

  return row;
};

beforeEach(async () => {
  db = await createTestDb();
  state.db = db;
  state.role = "admin";
  vi.mocked(revalidatePath).mockClear();

  const [row] = await db
    .insert(users)
    .values({ name: "An", nameKey: "an" })
    .returning({ id: users.id });

  userId = row.id;
});

describe("setChatEnabledAction", () => {
  it("starts locked and unlocks, recording the admin and the time", async () => {
    expect((await loadUser()).chatEnabled).toBeNull();

    const before = Date.now() - 1000;
    const result = await setChatEnabledAction(userId, true);
    const row = await loadUser();

    expect(result).toEqual({ status: "success" });
    expect(row.chatEnabled).toBe(true);
    expect(row.chatEnabledByAdminId).toBe(7);
    expect(row.chatEnabledChangedAt!.getTime()).toBeGreaterThanOrEqual(before);
    expect(revalidatePath).toHaveBeenCalledWith(`/admin/users/${userId}`);
  });

  it("locks again with false, not null", async () => {
    await setChatEnabledAction(userId, true);
    await setChatEnabledAction(userId, false);

    expect((await loadUser()).chatEnabled).toBe(false);
  });

  it("returns an error for a missing user and writes nothing", async () => {
    const result = await setChatEnabledAction(9999, true);

    expect(result).toEqual({
      status: "error",
      message: "Không tìm thấy user này",
    });
    expect(revalidatePath).not.toHaveBeenCalled();
    expect((await loadUser()).chatEnabled).toBeNull();
  });

  it.each([0, -3, 1.5, Number.NaN])("rejects user id %s", async (badId) => {
    const result = await setChatEnabledAction(badId, true);

    expect(result.status).toBe("error");
    expect((await loadUser()).chatEnabled).toBeNull();
  });

  it("rejects a non-boolean enabled value", async () => {
    const result = await setChatEnabledAction(
      userId,
      "true" as unknown as boolean,
    );

    expect(result.status).toBe("error");
    expect((await loadUser()).chatEnabled).toBeNull();
  });

  it("redirects a non-admin session and changes nothing", async () => {
    state.role = "user";
    // requireAdmin() redirects, which throws; the wrapper lets it through.
    await expect(setChatEnabledAction(userId, true)).rejects.toMatchObject({
      digest: expect.stringContaining("NEXT_REDIRECT"),
    });

    expect((await loadUser()).chatEnabled).toBeNull();
  });
});

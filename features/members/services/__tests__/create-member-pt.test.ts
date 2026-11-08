import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { INITIAL_FORM_STATE } from "@/constants/form";
import { createTestDb, type TestDb } from "@/db/__tests__/create-test-db";
import { admins, users } from "@/db/schema";

const state = vi.hoisted(() => ({
  db: null as unknown,
  admin: { id: 1, role: "super_admin" as "super_admin" | "pt" },
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/services/logger", () => ({ logServerError: vi.fn() }));
vi.mock("@/services/auth-guard", () => ({
  requireAdmin: vi.fn(async () => state.admin),
}));
vi.mock("@/db", () => ({
  db: new Proxy(
    {},
    { get: (_target, property) => Reflect.get(state.db as object, property) },
  ),
}));

const { createMemberAction } =
  await import("@/features/members/services/member-actions");

let db: TestDb;

const toFormData = (fields: Record<string, string>) => {
  const formData = new FormData();

  for (const [key, value] of Object.entries(fields)) {
    formData.set(key, value);
  }
  return formData;
};

const addAdmin = async (name: string, role: "super_admin" | "pt") => {
  const [row] = await db
    .insert(admins)
    .values({ username: name, usernameKey: name, passwordHash: "x", role })
    .returning({ id: admins.id });

  return row.id;
};

const create = (fields: Record<string, string>) =>
  createMemberAction(INITIAL_FORM_STATE, toFormData(fields));

const ptOf = async (name: string) => {
  const [row] = await db
    .select({ ptAdminId: users.ptAdminId })
    .from(users)
    .where(eq(users.name, name));

  return row?.ptAdminId;
};

beforeEach(async () => {
  db = await createTestDb();
  state.db = db;
  state.admin = {
    id: await addAdmin("root", "super_admin"),
    role: "super_admin",
  };
});

describe("createMemberAction PT assignment", () => {
  it("puts a PT's trainee in their own workspace and ignores a posted PT", async () => {
    const pt = await addAdmin("pt-a", "pt");
    const other = await addAdmin("pt-b", "pt");

    state.admin = { id: pt, role: "pt" };
    const result = await create({
      name: "An",
      email: "an@example.com",
      ptAdminId: String(other),
    });

    expect(result.status).toBe("success");
    expect(await ptOf("An")).toBe(pt);
  });

  it("lets a super admin leave the trainee without a PT", async () => {
    const result = await create({ name: "Binh", email: "binh@example.com" });

    expect(result.status).toBe("success");
    expect(await ptOf("Binh")).toBeNull();
  });

  it("lets a super admin pick an existing PT", async () => {
    const pt = await addAdmin("pt-a", "pt");
    const result = await create({
      name: "Chi",
      email: "chi@example.com",
      ptAdminId: String(pt),
    });

    expect(result.status).toBe("success");
    expect(await ptOf("Chi")).toBe(pt);
  });

  it.each([
    ["a missing id", "9999"],
    ["a non-numeric value", "abc"],
    ["a negative id", "-1"],
  ])("rejects %s and creates nobody", async (_label, ptAdminId) => {
    const result = await create({
      name: "Dung",
      email: "dung@example.com",
      ptAdminId,
    });

    expect(result.status).toBe("error");
    expect(result.fieldErrors?.ptAdminId).toBeTruthy();
    expect(await ptOf("Dung")).toBeUndefined();
  });

  it("rejects a super admin account as the PT", async () => {
    const result = await create({
      name: "Em",
      email: "em@example.com",
      ptAdminId: String(state.admin.id),
    });

    expect(result.status).toBe("error");
    expect(await ptOf("Em")).toBeUndefined();
  });
});

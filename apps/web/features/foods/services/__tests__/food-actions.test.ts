import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { INITIAL_FORM_STATE } from "@/constants/form";
import { createTestDb, type TestDb } from "@/db/__tests__/create-test-db";
import { foods } from "@/db/schema";

const state = vi.hoisted(() => ({
  db: null as unknown,
  role: "admin",
  adminRole: "super_admin" as "super_admin" | "pt",
  // Pretend the duplicate check found nothing, as when two saves race.
  skipNameCheck: false,
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
// The session cookie is the only thing faked: the real requireAdmin runs.
vi.mock("@/services/api/me", async () => {
  const { fakeAdminMe, fakeUserMe } = await import("@/services/api/testing");

  // GET /v1/auth/me is the only thing faked: the real guards run.
  return {
    fetchMe: vi.fn(async (role: string) => {
      if (role !== state.role) {
        return null;
      }
      return role === "admin"
        ? fakeAdminMe({ id: 1, username: "pt", role: state.adminRole })
        : fakeUserMe({ id: 1 });
    }),
  };
});
vi.mock("@/services/admins", () => ({
  findAdminById: vi.fn(async (id: number) => ({
    id,
    username: "pt",
    role: state.adminRole,
    verified: false,
  })),
}));
vi.mock("@/services/users", () => ({
  findUserById: vi.fn(async () => null),
  emptyUserRow: vi.fn(() => ({})),
}));
vi.mock("@/features/foods/services/food-queries", async (importOriginal) => {
  const original =
    await importOriginal<
      typeof import("@/features/foods/services/food-queries")
    >();

  return {
    ...original,
    findActiveFoodByNameKey: (
      ...args: Parameters<typeof original.findActiveFoodByNameKey>
    ) =>
      state.skipNameCheck
        ? Promise.resolve(null)
        : original.findActiveFoodByNameKey(...args),
  };
});
vi.mock("@/db", () => ({
  db: new Proxy(
    {},
    { get: (_target, property) => Reflect.get(state.db as object, property) },
  ),
}));

const { archiveFoodAction, createFoodAction, updateFoodAction } =
  await import("@/features/foods/services/food-actions");
const { listFoods } = await import("@/features/foods/services/food-queries");

const CHICKEN: Record<string, string> = {
  name: "Ức gà (chín)",
  group: "meat",
  state: "cooked",
  kcal: "165",
  protein: "31",
  carbs: "0",
  fat: "3.6",
  source: "USDA FDC 171477",
};

const toFormData = (fields: Record<string, string>) => {
  const formData = new FormData();

  for (const [key, value] of Object.entries(fields)) {
    formData.set(key, value);
  }
  return formData;
};

let db: TestDb;

beforeEach(async () => {
  db = await createTestDb();
  state.db = db;
  state.role = "admin";
  state.adminRole = "super_admin";
  state.skipNameCheck = false;
});

const rowCount = async () => (await db.select().from(foods)).length;

describe("createFoodAction", () => {
  it("stores the food with its accent-free name key", async () => {
    const result = await createFoodAction(
      INITIAL_FORM_STATE,
      toFormData(CHICKEN),
    );

    expect(result.status).toBe("success");

    const [row] = await db.select().from(foods);

    expect(row).toMatchObject({
      name: "Ức gà (chín)",
      nameKey: "uc ga (chin)",
      group: "meat",
      state: "cooked",
      kcal: 165,
      protein: 31,
      carbs: 0,
      fat: 3.6,
      fiber: null,
      servingLabel: null,
      servingGrams: null,
      source: "USDA FDC 171477",
      archivedAt: null,
    });
  });

  it("F6: saves nothing and reports the field when the input is bad", async () => {
    const result = await createFoodAction(
      INITIAL_FORM_STATE,
      toFormData({ ...CHICKEN, name: "", protein: "-3" }),
    );

    expect(result.status).toBe("error");
    expect(result.fieldErrors).toEqual({
      name: "Nhập tên món",
      protein: "Protein không được âm",
    });
    expect(await rowCount()).toBe(0);
  });

  it("F4: refuses a kcal that is 140 % off unless the box is ticked", async () => {
    const refused = await createFoodAction(
      INITIAL_FORM_STATE,
      toFormData({ ...CHICKEN, kcal: "65" }),
    );

    expect(refused.status).toBe("error");
    expect(refused.fieldErrors?.kcal).toContain("lệch 141%");
    expect(await rowCount()).toBe(0);

    const accepted = await createFoodAction(
      INITIAL_FORM_STATE,
      toFormData({ ...CHICKEN, kcal: "65", confirmed: "on" }),
    );

    expect(accepted.status).toBe("success");
    expect((await db.select().from(foods))[0].kcal).toBe(65);
  });

  it("F7: refuses a second active food with the same name, ignoring accents and case", async () => {
    await createFoodAction(INITIAL_FORM_STATE, toFormData(CHICKEN));

    const result = await createFoodAction(
      INITIAL_FORM_STATE,
      toFormData({ ...CHICKEN, name: "UC GA (CHIN)" }),
    );

    expect(result.status).toBe("error");
    expect(result.fieldErrors?.name).toBe(
      "Đã có món trùng tên. Thêm trạng thái (sống/chín) để phân biệt.",
    );
    expect(await rowCount()).toBe(1);
  });

  it("F7: the raw and cooked versions are two different foods", async () => {
    await createFoodAction(INITIAL_FORM_STATE, toFormData(CHICKEN));

    const raw = await createFoodAction(
      INITIAL_FORM_STATE,
      toFormData({
        ...CHICKEN,
        name: "Ức gà (sống)",
        state: "raw",
        kcal: "120",
        protein: "22.5",
        fat: "2.6",
      }),
    );

    expect(raw.status).toBe("success");
    expect(await rowCount()).toBe(2);
  });

  it("F7: an archived food's name can be used again", async () => {
    await createFoodAction(INITIAL_FORM_STATE, toFormData(CHICKEN));

    const [first] = await db.select().from(foods);

    await archiveFoodAction(first.id);

    const again = await createFoodAction(
      INITIAL_FORM_STATE,
      toFormData(CHICKEN),
    );

    expect(again.status).toBe("success");
    expect(await rowCount()).toBe(2);
  });
});

describe("duplicate names that slip past the check", () => {
  it("create: the unique index refuses the second row and the action reports the name", async () => {
    await createFoodAction(INITIAL_FORM_STATE, toFormData(CHICKEN));
    state.skipNameCheck = true;

    const result = await createFoodAction(
      INITIAL_FORM_STATE,
      toFormData({ ...CHICKEN, name: "uc ga (chin)" }),
    );

    expect(result.status).toBe("error");
    expect(result.fieldErrors?.name).toContain("trùng tên");
    expect(await rowCount()).toBe(1);
  });

  it("update: renaming onto another active food is refused the same way", async () => {
    await createFoodAction(INITIAL_FORM_STATE, toFormData(CHICKEN));
    await createFoodAction(
      INITIAL_FORM_STATE,
      toFormData({ ...CHICKEN, name: "Ức gà (sống)", state: "raw" }),
    );

    const [first] = await db
      .select()
      .from(foods)
      .where(eq(foods.nameKey, "uc ga (chin)"));

    state.skipNameCheck = true;

    const result = await updateFoodAction(
      INITIAL_FORM_STATE,
      toFormData({ ...CHICKEN, id: String(first.id), name: "Ức gà (sống)" }),
    );

    expect(result.status).toBe("error");
    expect(result.fieldErrors?.name).toContain("trùng tên");
    expect(
      (await db.select().from(foods).where(eq(foods.id, first.id)))[0].name,
    ).toBe("Ức gà (chín)");
  });

  it("the index allows an archived row to share a name with an active one", async () => {
    await createFoodAction(INITIAL_FORM_STATE, toFormData(CHICKEN));

    const [first] = await db.select().from(foods);

    await archiveFoodAction(first.id);
    state.skipNameCheck = true;

    const again = await createFoodAction(
      INITIAL_FORM_STATE,
      toFormData(CHICKEN),
    );

    expect(again.status).toBe("success");
    expect(await rowCount()).toBe(2);
  });
});

describe("updateFoodAction", () => {
  const createChicken = async () => {
    await createFoodAction(INITIAL_FORM_STATE, toFormData(CHICKEN));

    return (await db.select().from(foods))[0];
  };

  it("changes the numbers and the search key", async () => {
    const chicken = await createChicken();
    const result = await updateFoodAction(
      INITIAL_FORM_STATE,
      toFormData({
        ...CHICKEN,
        id: String(chicken.id),
        name: "Ức gà luộc",
        fat: "4",
        kcal: "160",
      }),
    );

    expect(result.status).toBe("success");

    const [row] = await db.select().from(foods);

    expect(row).toMatchObject({
      id: chicken.id,
      name: "Ức gà luộc",
      nameKey: "uc ga luoc",
      fat: 4,
      kcal: 160,
    });
  });

  it("allows saving a food under its own name", async () => {
    const chicken = await createChicken();
    const result = await updateFoodAction(
      INITIAL_FORM_STATE,
      toFormData({ ...CHICKEN, id: String(chicken.id), fat: "4" }),
    );

    expect(result.status).toBe("success");
  });

  it("F7: refuses a rename onto another active food", async () => {
    const chicken = await createChicken();

    await createFoodAction(
      INITIAL_FORM_STATE,
      toFormData({ ...CHICKEN, name: "Ức gà (sống)", state: "raw" }),
    );

    const result = await updateFoodAction(
      INITIAL_FORM_STATE,
      toFormData({
        ...CHICKEN,
        id: String(chicken.id),
        name: "ức gà (sống)",
      }),
    );

    expect(result.status).toBe("error");
    expect(result.fieldErrors?.name).toContain("trùng tên");
    expect(
      (await db.select().from(foods).where(eq(foods.id, chicken.id)))[0].name,
    ).toBe("Ức gà (chín)");
  });

  it("reports a missing or archived food instead of inserting", async () => {
    const chicken = await createChicken();

    await archiveFoodAction(chicken.id);

    for (const id of [String(chicken.id), "9999", "abc", ""]) {
      const result = await updateFoodAction(
        INITIAL_FORM_STATE,
        toFormData({ ...CHICKEN, id }),
      );

      expect(result.status).toBe("error");
      expect(result.message).toBe("Món này không còn tồn tại");
    }
    expect(await rowCount()).toBe(1);
  });
});

describe("archiveFoodAction", () => {
  it("hides the food from the list but keeps the row", async () => {
    await createFoodAction(INITIAL_FORM_STATE, toFormData(CHICKEN));

    const [chicken] = await db.select().from(foods);

    expect(await archiveFoodAction(chicken.id)).toEqual({ status: "success" });

    const [row] = await db.select().from(foods);

    expect(row.archivedAt).toBeInstanceOf(Date);
    expect(row.kcal).toBe(165);
    expect(await listFoods()).toEqual([]);
  });

  it("reports a food that is already archived or never existed", async () => {
    await createFoodAction(INITIAL_FORM_STATE, toFormData(CHICKEN));

    const [chicken] = await db.select().from(foods);

    await archiveFoodAction(chicken.id);

    expect(await archiveFoodAction(chicken.id)).toEqual({
      status: "error",
      message: "Món này không còn tồn tại",
    });
    expect(await archiveFoodAction(9999)).toEqual({
      status: "error",
      message: "Món này không còn tồn tại",
    });
    expect(await archiveFoodAction(Number.NaN)).toEqual({
      status: "error",
      message: "Món này không còn tồn tại",
    });
  });
});

describe("F10 non-admin access", () => {
  const seedChicken = async () => {
    await createFoodAction(INITIAL_FORM_STATE, toFormData(CHICKEN));
    state.role = "user";

    return (await db.select().from(foods))[0];
  };

  // requireAdmin() sends a non-admin to /session/end with redirect(), which
  // throws; the error wrapper lets that reach Next.js.
  const expectRedirect = async (call: Promise<unknown>) => {
    await expect(call).rejects.toMatchObject({
      digest: expect.stringContaining("NEXT_REDIRECT"),
    });
  };

  it("refuses create and writes nothing", async () => {
    state.role = "user";
    await expectRedirect(
      createFoodAction(INITIAL_FORM_STATE, toFormData(CHICKEN)),
    );
    expect(await rowCount()).toBe(0);
  });

  it("refuses update and leaves the food as it was", async () => {
    const chicken = await seedChicken();

    await expectRedirect(
      updateFoodAction(
        INITIAL_FORM_STATE,
        toFormData({ ...CHICKEN, id: String(chicken.id), name: "Hacked" }),
      ),
    );
    expect((await db.select().from(foods))[0].name).toBe("Ức gà (chín)");
  });

  it("refuses archive and leaves the food active", async () => {
    const chicken = await seedChicken();

    await expectRedirect(archiveFoodAction(chicken.id));
    expect((await db.select().from(foods))[0].archivedAt).toBeNull();
  });

  it("refuses a PT account: the food library is super admin only", async () => {
    state.adminRole = "pt";
    await expectRedirect(
      createFoodAction(INITIAL_FORM_STATE, toFormData(CHICKEN)),
    );
    expect(await rowCount()).toBe(0);
  });
});

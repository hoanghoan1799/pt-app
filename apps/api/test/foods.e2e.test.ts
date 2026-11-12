import type { INestApplication } from "@nestjs/common";
import { FOOD_MESSAGES } from "@pt/contracts";
import { AUTH_MESSAGES } from "@pt/contracts";
import request from "supertest";
import type { DataSource } from "typeorm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { FoodsService } from "../src/foods/foods.service.js";
import { SEED_FOODS } from "../src/foods/seed/seed-foods.js";
import { createTestApp } from "./support/app.js";
import { bearer, seedAdmin, seedUser, tokenOf } from "./support/auth.js";
import { createTestDatabase, type TestDatabase } from "./support/database.js";

let db: TestDatabase;
let app: INestApplication;
let ds: DataSource;
let tokens: {
  superAdmin: string;
  pt: string;
  trainee: string;
  lockedSuper: string;
};

const CHICKEN = {
  name: "Ức gà (chín)",
  group: "meat",
  state: "cooked",
  kcal: "165",
  protein: "31",
  carbs: "0",
  fat: "3.6",
  source: "USDA FDC 171477",
};

const api = (method: "get" | "post" | "patch" | "delete", path: string) =>
  request(app.getHttpServer())[method](`/v1${path}`);

const as = (
  method: "get" | "post" | "patch" | "delete",
  path: string,
  token: string | undefined,
  body?: object,
) => {
  const call = api(method, path);

  if (token) {
    call.set(bearer(token));
  }
  return body ? call.send(body) : call;
};

const create = (body: object, token = tokens.superAdmin) =>
  as("post", "/foods", token, body);

const rows = (): Promise<Record<string, unknown>[]> =>
  ds.query(`SELECT * FROM foods ORDER BY id`);

const names = (response: request.Response) =>
  (response.body.items as { name: string }[]).map((food) => food.name);

beforeAll(async () => {
  db = await createTestDatabase();
  ds = db.dataSource;
  app = await createTestApp({ databaseUrl: db.url, nodeEnv: "test" });

  const superAdmin = await seedAdmin(ds, { role: "super_admin" });
  const lockedSuper = await seedAdmin(ds, {
    role: "super_admin",
    passcode: "1234",
  });
  const pt = await seedAdmin(ds, { role: "pt" });
  const trainee = await seedUser(ds);

  tokens = {
    superAdmin: await tokenOf(app, { kind: "admin", ...superAdmin }),
    lockedSuper: await tokenOf(app, { kind: "admin", ...lockedSuper }),
    pt: await tokenOf(app, { kind: "admin", ...pt }),
    trainee: await tokenOf(app, { kind: "user", ...trainee }),
  };
});

afterAll(async () => {
  await app.close();
  await db.drop();
});

beforeEach(async () => {
  await ds.query(`DELETE FROM foods`);
});

describe("POST /v1/foods", () => {
  it("stores the food with its accent-free name key and returns it", async () => {
    const response = await create(CHICKEN);

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      id: expect.any(Number),
      name: "Ức gà (chín)",
      nameKey: "uc ga (chin)",
      nameEn: null,
      nameZh: null,
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
    });

    const [row] = await rows();

    expect(row).toMatchObject({
      name: "Ức gà (chín)",
      name_key: "uc ga (chin)",
      kcal: 165,
      fat: 3.6,
      archived_at: null,
    });
  });

  it("accepts numbers and the Vietnamese decimal comma, and normalises text", async () => {
    const response = await create({
      name: "  Phở   bò ",
      group: "dish",
      state: "",
      kcal: 100,
      protein: "5,5",
      carbs: 10,
      fat: "2",
      servingLabel: " 1  tô ",
      servingGrams: 500,
      nameEn: "",
      nameZh: "牛肉河粉",
      confirmed: true,
    });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      name: "Phở bò",
      nameKey: "pho bo",
      state: null,
      protein: 5.5,
      servingLabel: "1 tô",
      servingGrams: 500,
      nameEn: null,
      nameZh: "牛肉河粉",
    });
  });

  it("F6: saves nothing and names every bad field", async () => {
    const response = await create({ ...CHICKEN, name: "", protein: "-3" });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("VALIDATION_FAILED");
    expect(response.body.message).toContain("name: Nhập tên món");
    expect(response.body.message).toContain("protein: Protein không được âm");
    expect(await rows()).toHaveLength(0);
  });

  it("F6: a missing body field gets the form's message", async () => {
    const response = await create({ name: "Cơm" });

    expect(response.status).toBe(400);
    expect(response.body.message).toContain("group: Chọn nhóm món");
    expect(response.body.message).toContain("kcal: Nhập Calo");
  });

  it("F4: refuses a kcal 141 % off unless the box is ticked", async () => {
    const refused = await create({ ...CHICKEN, kcal: "65" });

    expect(refused.status).toBe(400);
    expect(refused.body.message).toContain("kcal: Calo nhập 65 lệch 141%");
    expect(await rows()).toHaveLength(0);

    const accepted = await create({ ...CHICKEN, kcal: "65", confirmed: "on" });

    expect(accepted.status).toBe(201);
    expect(accepted.body.kcal).toBe(65);
  });

  it("F7: refuses a second active food with the same name, ignoring accents and case", async () => {
    await create(CHICKEN);

    const response = await create({ ...CHICKEN, name: "UC GA (CHIN)" });

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      code: "FOOD_NAME_TAKEN",
      message:
        "Đã có món trùng tên. Thêm trạng thái (sống/chín) để phân biệt.",
      details: { field: "name" },
    });
    expect(await rows()).toHaveLength(1);
  });

  it("F7: raw and cooked are two foods, and an archived name can be reused", async () => {
    const first = await create(CHICKEN);

    expect(
      (
        await create({
          ...CHICKEN,
          name: "Ức gà (sống)",
          state: "raw",
          kcal: "120",
          protein: "22.5",
          fat: "2.6",
        })
      ).status,
    ).toBe(201);

    await as("delete", `/foods/${first.body.id}`, tokens.superAdmin);

    expect((await create(CHICKEN)).status).toBe(201);
    expect(await rows()).toHaveLength(3);
  });

  it("two saves with the same name racing: one wins, the unique index answers the other", async () => {
    const results = await Promise.all([
      create({ ...CHICKEN, name: "Cá hồi (chín)", group: "seafood" }),
      create({ ...CHICKEN, name: "ca hoi (chin)", group: "seafood" }),
    ]);

    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(results.find((r) => r.status === 409)?.body.code).toBe(
      "FOOD_NAME_TAKEN",
    );
    expect(await rows()).toHaveLength(1);
  });

  it("is 401 without a session and 403 for a PT, a trainee and a locked super admin", async () => {
    const anonymous = await as("post", "/foods", undefined, CHICKEN);

    expect(anonymous.status).toBe(401);
    expect(anonymous.body.code).toBe("SESSION_INVALID");

    for (const token of [tokens.pt, tokens.trainee]) {
      const response = await create(CHICKEN, token);

      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({
        code: "FORBIDDEN",
        message: AUTH_MESSAGES.FORBIDDEN,
      });
    }

    const locked = await create(CHICKEN, tokens.lockedSuper);

    expect(locked.status).toBe(403);
    expect(locked.body.code).toBe("ADMIN_LOCKED");
    expect(await rows()).toHaveLength(0);
  });
});

describe("PATCH /v1/foods/:id", () => {
  const createChicken = async () =>
    (await create(CHICKEN)).body as { id: number };

  it("changes the numbers and the search key", async () => {
    const chicken = await createChicken();
    const response = await as(
      "patch",
      `/foods/${chicken.id}`,
      tokens.superAdmin,
      { ...CHICKEN, name: "Ức gà luộc", fat: "4", kcal: "160" },
    );

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      id: chicken.id,
      name: "Ức gà luộc",
      nameKey: "uc ga luoc",
      fat: 4,
      kcal: 160,
    });

    const [row] = await rows();

    expect(row).toMatchObject({ name_key: "uc ga luoc", fat: 4 });
    expect(row.updated_at).toBeInstanceOf(Date);
  });

  it("allows saving a food under its own name", async () => {
    const chicken = await createChicken();
    const response = await as(
      "patch",
      `/foods/${chicken.id}`,
      tokens.superAdmin,
      { ...CHICKEN, fat: "4" },
    );

    expect(response.status).toBe(200);
  });

  it("F7: refuses a rename onto another active food and leaves the food as it was", async () => {
    const chicken = await createChicken();

    await create({ ...CHICKEN, name: "Ức gà (sống)", state: "raw" });

    const response = await as(
      "patch",
      `/foods/${chicken.id}`,
      tokens.superAdmin,
      { ...CHICKEN, name: "ức gà (sống)" },
    );

    expect(response.status).toBe(409);
    expect(response.body.code).toBe("FOOD_NAME_TAKEN");

    const [row] = await ds.query(`SELECT name FROM foods WHERE id = $1`, [
      chicken.id,
    ]);

    expect(row.name).toBe("Ức gà (chín)");
  });

  it("reports a missing, archived or malformed id instead of inserting", async () => {
    const chicken = await createChicken();

    await as("delete", `/foods/${chicken.id}`, tokens.superAdmin);

    for (const id of [String(chicken.id), "9999", "abc", "0", "99999999999"]) {
      const response = await as("patch", `/foods/${id}`, tokens.superAdmin, {
        ...CHICKEN,
      });

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({
        code: "FOOD_NOT_FOUND",
        message: "Món này không còn tồn tại",
      });
    }
    expect(await rows()).toHaveLength(1);
  });

  it("validates the body like the create route", async () => {
    const chicken = await createChicken();
    const response = await as(
      "patch",
      `/foods/${chicken.id}`,
      tokens.superAdmin,
      { ...CHICKEN, servingLabel: "1 tô" },
    );

    expect(response.status).toBe(400);
    expect(response.body.message).toContain(
      "servingGrams: Nhập khối lượng khẩu phần (gram)",
    );
  });

  it("F10: 401 without a session; 403 for a PT and a trainee, food untouched", async () => {
    const chicken = await createChicken();

    expect(
      (
        await as("patch", `/foods/${chicken.id}`, undefined, {
          ...CHICKEN,
          name: "Hacked",
        })
      ).status,
    ).toBe(401);

    for (const token of [tokens.pt, tokens.trainee]) {
      const response = await as("patch", `/foods/${chicken.id}`, token, {
        ...CHICKEN,
        name: "Hacked",
      });

      expect(response.status).toBe(403);
    }
    expect((await rows())[0].name).toBe("Ức gà (chín)");
  });
});

describe("DELETE /v1/foods/:id", () => {
  it("archives: hidden from the list, the row and its numbers stay", async () => {
    const chicken = (await create(CHICKEN)).body as { id: number };
    const response = await as("delete", `/foods/${chicken.id}`, tokens.superAdmin);

    expect(response.status).toBe(204);
    expect(response.text).toBe("");

    const [row] = await rows();

    expect(row.archived_at).toBeInstanceOf(Date);
    expect(row.kcal).toBe(165);
    expect(
      (await as("get", "/foods", tokens.trainee)).body,
    ).toEqual({ items: [], nextCursor: null });
    expect(
      (await as("get", `/foods/${chicken.id}`, tokens.trainee)).status,
    ).toBe(404);
  });

  it("reports a food that is already archived, never existed or has a bad id", async () => {
    const chicken = (await create(CHICKEN)).body as { id: number };

    await as("delete", `/foods/${chicken.id}`, tokens.superAdmin);

    for (const id of [String(chicken.id), "9999", "abc", "-1"]) {
      const response = await as("delete", `/foods/${id}`, tokens.superAdmin);

      expect(response.status).toBe(404);
      expect(response.body.message).toBe("Món này không còn tồn tại");
    }
  });

  it("F10: 401 / 403 and the food stays active", async () => {
    const chicken = (await create(CHICKEN)).body as { id: number };

    expect((await as("delete", `/foods/${chicken.id}`, undefined)).status).toBe(
      401,
    );
    for (const token of [tokens.pt, tokens.trainee]) {
      expect((await as("delete", `/foods/${chicken.id}`, token)).status).toBe(
        403,
      );
    }
    expect((await rows())[0].archived_at).toBeNull();
  });
});

describe("GET /v1/foods", () => {
  const seed = async () => {
    for (const food of [
      { name: "Ức gà (chín)", group: "meat", state: "cooked" },
      { name: "Ức gà (sống)", group: "meat", state: "raw" },
      { name: "Đậu hũ", group: "legume_nut", state: "" },
      { name: "Cá hồi (chín)", group: "seafood", state: "cooked" },
      { name: "Phở bò", group: "dish", state: "" },
    ]) {
      const response = await create({
        ...CHICKEN,
        ...food,
        kcal: "100",
        protein: "25",
        carbs: "0",
        fat: "0",
      });

      expect(response.status).toBe(201);
    }
  };

  it("is 401 without a session and open to trainees, PTs and super admins", async () => {
    expect((await as("get", "/foods", undefined)).status).toBe(401);
    for (const token of [tokens.trainee, tokens.pt, tokens.superAdmin]) {
      expect((await as("get", "/foods", token)).status).toBe(200);
    }
    expect((await as("get", "/foods", tokens.lockedSuper)).body.code).toBe(
      "ADMIN_LOCKED",
    );
  });

  it("lists active foods sorted by the search key", async () => {
    await seed();

    const response = await as("get", "/foods", tokens.trainee);

    expect(names(response)).toEqual([
      "Cá hồi (chín)",
      "Đậu hũ",
      "Phở bò",
      "Ức gà (chín)",
      "Ức gà (sống)",
    ]);
    expect(response.body.nextCursor).toBeNull();
    expect(response.body.items[0]).not.toHaveProperty("archivedAt");
  });

  it('F11: finds "Ức gà" when typing "uc ga" without accents', async () => {
    await seed();

    const response = await as("get", "/foods?q=uc%20ga", tokens.trainee);

    expect(names(response)).toEqual(["Ức gà (chín)", "Ức gà (sống)"]);
  });

  it("F11: ignores case, extra spaces and đ; matches words in any order", async () => {
    await seed();

    expect(
      names(await as("get", "/foods?q=%20%20UC%20%20GA%20CHIN%20", tokens.pt)),
    ).toEqual(["Ức gà (chín)"]);
    expect(names(await as("get", "/foods?q=dau%20hu", tokens.pt))).toEqual([
      "Đậu hũ",
    ]);
    expect(names(await as("get", "/foods?q=%C4%90%E1%BA%ACU", tokens.pt))).toEqual(
      ["Đậu hũ"],
    );
    expect(names(await as("get", "/foods?q=chin%20ca", tokens.pt))).toEqual([
      "Cá hồi (chín)",
    ]);
  });

  it("F11: an empty query lists everything, text that is not a name finds nothing", async () => {
    await seed();

    expect(
      (await as("get", "/foods?q=", tokens.trainee)).body.items,
    ).toHaveLength(5);
    expect((await as("get", "/foods?q=pizza", tokens.trainee)).body.items).toEqual(
      [],
    );
  });

  it("treats % and _ in the query as plain characters", async () => {
    await seed();

    expect((await as("get", "/foods?q=%25", tokens.trainee)).body.items).toEqual(
      [],
    );
    expect((await as("get", "/foods?q=_", tokens.trainee)).body.items).toEqual(
      [],
    );
  });

  it("F11: narrows to one group and combines it with the query", async () => {
    await seed();

    expect(names(await as("get", "/foods?group=meat", tokens.trainee))).toEqual([
      "Ức gà (chín)",
      "Ức gà (sống)",
    ]);
    expect(names(await as("get", "/foods?group=dish", tokens.trainee))).toEqual([
      "Phở bò",
    ]);
    expect(
      names(await as("get", "/foods?group=meat&q=chin", tokens.trainee)),
    ).toEqual(["Ức gà (chín)"]);
    expect(
      (await as("get", "/foods?group=dish&q=chin", tokens.trainee)).body.items,
    ).toEqual([]);
  });

  it("searches the English and Chinese names for those locales only, folding accents in SQL", async () => {
    await create({
      ...CHICKEN,
      name: "Bánh flan",
      group: "other",
      state: "",
      nameEn: "Crème caramel",
      nameZh: "焦糖布丁",
    });
    await seed();

    expect(
      names(await as("get", "/foods?q=creme&locale=en", tokens.trainee)),
    ).toEqual(["Bánh flan"]);
    expect(
      names(await as("get", "/foods?q=%E7%84%A6%E7%B3%96&locale=zh", tokens.trainee)),
    ).toEqual(["Bánh flan"]);
    // vi (the default) and the wrong locale do not see translations.
    expect(
      (await as("get", "/foods?q=creme", tokens.trainee)).body.items,
    ).toEqual([]);
    expect(
      (await as("get", "/foods?q=creme&locale=zh", tokens.trainee)).body.items,
    ).toEqual([]);
  });

  it("falls back to the starter translation for a food whose translation column is blank", async () => {
    await create({ ...CHICKEN });
    await create({
      ...CHICKEN,
      name: "Ức gà (sống)",
      state: "raw",
      nameEn: "My own raw chicken",
    });

    // "Ức gà (chín)" has no stored English name: the starter map supplies it.
    expect(
      names(await as("get", "/foods?q=chicken&locale=en", tokens.trainee)),
    ).toEqual(["Ức gà (chín)", "Ức gà (sống)"]);
    // A stored translation wins over the starter map.
    expect(
      names(await as("get", "/foods?q=breast%20raw&locale=en", tokens.trainee)),
    ).toEqual([]);
    expect(
      names(await as("get", "/foods?q=own%20raw&locale=en", tokens.trainee)),
    ).toEqual(["Ức gà (sống)"]);
  });

  it("pages with an opaque cursor and returns every food exactly once", async () => {
    await seed();

    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;

    do {
      const url: string = `/foods?limit=2${cursor ? `&cursor=${cursor}` : ""}`;
      const page = await as("get", url, tokens.trainee);

      expect(page.status).toBe(200);
      expect(page.body.items.length).toBeLessThanOrEqual(2);
      seen.push(...names(page));
      cursor = page.body.nextCursor;
      pages += 1;
    } while (cursor);

    expect(pages).toBe(3);
    expect(seen).toEqual([
      "Cá hồi (chín)",
      "Đậu hũ",
      "Phở bò",
      "Ức gà (chín)",
      "Ức gà (sống)",
    ]);
  });

  it("rejects a bad limit, group, locale or cursor with a 400", async () => {
    for (const query of [
      "limit=0",
      "limit=201",
      "limit=abc",
      "group=pizza",
      "locale=fr",
      "cursor=%25%25",
    ]) {
      const response = await as("get", `/foods?${query}`, tokens.trainee);

      expect(response.status, query).toBe(400);
      expect(response.body.code).toBe("VALIDATION_FAILED");
    }
  });
});

describe("GET /v1/foods/groups", () => {
  it("lists only groups that have an active food, with counts, in chip order", async () => {
    const a = (await create({ ...CHICKEN, name: "A", group: "dish" })).body;

    await create({ ...CHICKEN, name: "B", group: "meat" });
    await create({ ...CHICKEN, name: "C", group: "meat" });
    await create({ ...CHICKEN, name: "D", group: "fruit" });
    await as("delete", `/foods/${a.id}`, tokens.superAdmin);

    const response = await as("get", "/foods/groups", tokens.trainee);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      groups: [
        { group: "meat", count: 2 },
        { group: "fruit", count: 1 },
      ],
    });
    expect((await as("get", "/foods/groups", undefined)).status).toBe(401);
  });
});

describe("GET /v1/foods/:id", () => {
  it("returns the food to any signed-in actor", async () => {
    const { id } = (await create({ ...CHICKEN, fiber: "1,5" })).body;

    for (const token of [tokens.trainee, tokens.pt]) {
      const response = await as("get", `/foods/${id}`, token);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ id, name: "Ức gà (chín)", fiber: 1.5 });
    }
    expect((await as("get", `/foods/${id}`, undefined)).status).toBe(401);
  });

  it("is 404 with the food message for a missing, archived or malformed id", async () => {
    for (const id of ["9999", "abc", "0", "1.5", "99999999999"]) {
      const response = await as("get", `/foods/${id}`, tokens.trainee);

      expect(response.status, id).toBe(404);
      expect(response.body).toMatchObject({
        code: "FOOD_NOT_FOUND",
        message: FOOD_MESSAGES.NOT_FOUND,
      });
    }
  });
});

describe("starter library seed (insertMissingSeedFoods)", () => {
  const service = () => app.get(FoodsService);

  it("F12: inserts every starter food once and nothing on the second run", async () => {
    expect(await service().insertMissingSeedFoods()).toBe(SEED_FOODS.length);
    expect(await rows()).toHaveLength(SEED_FOODS.length);
    expect(await service().insertMissingSeedFoods()).toBe(0);
    expect(await rows()).toHaveLength(SEED_FOODS.length);
  });

  it("F12: only adds what is missing and never overwrites an edit", async () => {
    await service().insertMissingSeedFoods(SEED_FOODS.slice(0, 10));
    await ds.query(`UPDATE foods SET kcal = 999 WHERE name_key = 'uc ga (chin)'`);

    expect(await service().insertMissingSeedFoods()).toBe(
      SEED_FOODS.length - 10,
    );
    expect(
      (await ds.query(`SELECT kcal FROM foods WHERE name_key = 'uc ga (chin)'`))[0]
        .kcal,
    ).toBe(999);
  });

  it("F12: does not bring back a food the PT archived", async () => {
    await service().insertMissingSeedFoods();

    const chicken = (
      await ds.query(`SELECT id FROM foods WHERE name_key = 'uc ga (chin)'`)
    )[0];

    await as("delete", `/foods/${chicken.id}`, tokens.superAdmin);

    expect(await service().insertMissingSeedFoods()).toBe(0);
    expect(await rows()).toHaveLength(SEED_FOODS.length);
  });

  it("F12: stores the chicken breast numbers and its translations", async () => {
    await service().insertMissingSeedFoods();

    const response = await as("get", "/foods?q=uc%20ga%20chin", tokens.trainee);

    expect(response.body.items).toEqual([
      expect.objectContaining({
        name: "Ức gà (chín)",
        nameEn: "Chicken breast (cooked)",
        nameZh: "鸡胸肉（熟）",
        group: "meat",
        state: "cooked",
        kcal: 165,
        protein: 31,
        carbs: 0,
        fat: 3.6,
        source: "USDA SR Legacy, FDC 171477",
      }),
    ]);
  });
});

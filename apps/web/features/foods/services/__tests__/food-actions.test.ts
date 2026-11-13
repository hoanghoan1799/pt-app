import { revalidatePath } from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { INITIAL_FORM_STATE } from "@/constants/form";
import type { FakeApi } from "@/services/api/fake-call";

// The food rules (unique active name, archive keeps the row, the kcal check,
// super admin only) live in the API and are covered by
// apps/api/test/foods.e2e.test.ts. These tests cover what the web action still
// owns: the Zod check before the call, what is sent, how each answer is shown
// and where the pages are revalidated.

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/services/api/call", async () => {
  const { createFakeApi } = await import("@/services/api/fake-call");
  const fake = createFakeApi();

  return { callApi: fake.callApi, tryApi: fake.tryApi, fake };
});
vi.mock("@/services/auth-guard", () => ({
  requireSuperAdmin: vi.fn(async () => ({ id: 1 })),
}));

const { archiveFoodAction, createFoodAction, updateFoodAction } =
  await import("@/features/foods/services/food-actions");
const { fake } = (await import("@/services/api/call")) as unknown as {
  fake: FakeApi;
};

beforeEach(() => {
  fake.reset();
  vi.mocked(revalidatePath).mockClear();
});

const CHICKEN: Record<string, string> = {
  name: "Ức gà (chín)",
  group: "meat",
  state: "cooked",
  kcal: "165",
  protein: "31",
  carbs: "0",
  fat: "3,6",
  source: "USDA FDC 171477",
};

const toFormData = (fields: Record<string, string>) => {
  const formData = new FormData();

  for (const [key, value] of Object.entries(fields)) {
    formData.set(key, value);
  }
  return formData;
};

describe("createFoodAction", () => {
  it("sends the form text as typed to POST /v1/foods and revalidates both lists", async () => {
    const result = await createFoodAction(
      INITIAL_FORM_STATE,
      toFormData(CHICKEN),
    );

    expect(result).toMatchObject({ status: "success", message: "Đã thêm món" });
    expect(fake.requests).toEqual([
      expect.objectContaining({
        actor: "admin",
        method: "POST",
        path: "/v1/foods",
        // "3,6" stays text: the API parses the Vietnamese decimal comma.
        body: expect.objectContaining({
          name: "Ức gà (chín)",
          group: "meat",
          kcal: "165",
          fat: "3,6",
        }),
      }),
    ]);
    expect(revalidatePath).toHaveBeenCalledWith("/admin/foods", "layout");
    expect(revalidatePath).toHaveBeenCalledWith("/foods", "layout");
  });

  it("refuses an invalid form without calling the API", async () => {
    const result = await createFoodAction(
      INITIAL_FORM_STATE,
      toFormData({ ...CHICKEN, name: "" }),
    );

    expect(result).toMatchObject({
      status: "error",
      message: "Vui lòng kiểm tra lại thông tin",
    });
    expect(result.fieldErrors?.name).toBeTruthy();
    expect(fake.requests).toHaveLength(0);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("refuses a kcal far from the macros until the box is ticked, before calling the API", async () => {
    const result = await createFoodAction(
      INITIAL_FORM_STATE,
      toFormData({ ...CHICKEN, kcal: "65" }),
    );

    expect(result.status).toBe("error");
    expect(fake.requests).toHaveLength(0);
  });

  it("marks the name field when the API says the name is taken", async () => {
    fake.refuse(
      409,
      "FOOD_NAME_TAKEN",
      "Đã có món trùng tên. Thêm trạng thái (sống/chín) để phân biệt.",
    );

    const result = await createFoodAction(
      INITIAL_FORM_STATE,
      toFormData(CHICKEN),
    );

    expect(result).toMatchObject({
      status: "error",
      fieldErrors: {
        name: "Đã có món trùng tên. Thêm trạng thái (sống/chín) để phân biệt.",
      },
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("shows the API's own message for any other refusal", async () => {
    fake.refuse(403, "FORBIDDEN", "Bạn không có quyền");

    const result = await createFoodAction(
      INITIAL_FORM_STATE,
      toFormData(CHICKEN),
    );

    expect(result).toMatchObject({
      status: "error",
      message: "Bạn không có quyền",
    });
  });
});

describe("updateFoodAction", () => {
  it("sends the whole food to PATCH /v1/foods/:id", async () => {
    const result = await updateFoodAction(
      INITIAL_FORM_STATE,
      toFormData({ ...CHICKEN, id: "7", kcal: "170" }),
    );

    expect(result).toMatchObject({ status: "success" });
    expect(fake.requests).toEqual([
      expect.objectContaining({
        method: "PATCH",
        path: "/v1/foods/{id}",
        params: { path: { id: "7" } },
        body: expect.objectContaining({ kcal: "170" }),
      }),
    ]);
    expect(revalidatePath).toHaveBeenCalledTimes(2);
  });

  it("says the food is gone when the id is missing or the API answers 404", async () => {
    const withoutId = await updateFoodAction(
      INITIAL_FORM_STATE,
      toFormData(CHICKEN),
    );

    expect(withoutId).toMatchObject({
      status: "error",
      message: "Món này không còn tồn tại",
    });
    expect(fake.requests).toHaveLength(0);

    fake.refuse(404, "FOOD_NOT_FOUND", "Món này không còn tồn tại");

    const archived = await updateFoodAction(
      INITIAL_FORM_STATE,
      toFormData({ ...CHICKEN, id: "7" }),
    );

    expect(archived).toMatchObject({
      status: "error",
      message: "Món này không còn tồn tại",
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("marks the name field when another food has that name", async () => {
    fake.refuse(409, "FOOD_NAME_TAKEN", "Đã có món trùng tên.");

    const result = await updateFoodAction(
      INITIAL_FORM_STATE,
      toFormData({ ...CHICKEN, id: "7" }),
    );

    expect(result.fieldErrors?.name).toBeTruthy();
  });
});

describe("archiveFoodAction", () => {
  it("calls DELETE /v1/foods/:id and revalidates both lists", async () => {
    const result = await archiveFoodAction(7);

    expect(result).toEqual({ status: "success" });
    expect(fake.requests).toEqual([
      expect.objectContaining({
        method: "DELETE",
        path: "/v1/foods/{id}",
        params: { path: { id: "7" } },
      }),
    ]);
    expect(revalidatePath).toHaveBeenCalledWith("/admin/foods", "layout");
    expect(revalidatePath).toHaveBeenCalledWith("/foods", "layout");
  });

  it("refuses a bad id without calling the API and reports a missing food", async () => {
    expect(await archiveFoodAction(0)).toMatchObject({
      status: "error",
      message: "Món này không còn tồn tại",
    });
    expect(fake.requests).toHaveLength(0);

    fake.refuse(404, "FOOD_NOT_FOUND", "Món này không còn tồn tại");
    expect(await archiveFoodAction(7)).toMatchObject({
      status: "error",
      message: "Món này không còn tồn tại",
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

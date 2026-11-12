import { revalidatePath } from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { INITIAL_FORM_STATE } from "@/constants/form";
import type { FakeApi } from "@/services/api/fake-call";

// The nutrition rules (TDEE target, manual target kept, weigh-in moves the
// profile, empty entry, future day, entry ownership) live in the API and are
// covered by apps/api/test/nutrition.e2e.test.ts. These tests cover what the
// web actions still own: the Zod check, the request sent (form text as typed),
// the message chosen from the answer and the revalidation.

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/services/api/call", async () => {
  const { createFakeApi } = await import("@/services/api/fake-call");
  const fake = createFakeApi();

  return { callApi: fake.callApi, tryApi: fake.tryApi, fake };
});
vi.mock("@/services/auth-guard", () => ({
  requireAdmin: vi.fn(async () => ({ id: 1 })),
  requireUser: vi.fn(async () => ({ id: 9 })),
}));

const actions = await import("@/features/nutrition/services/nutrition-actions");
const { fake } = (await import("@/services/api/call")) as unknown as {
  fake: FakeApi;
};

const toFormData = (fields: Record<string, string>) => {
  const formData = new FormData();

  for (const [key, value] of Object.entries(fields)) {
    formData.set(key, value);
  }
  return formData;
};

const revalidated = () =>
  vi.mocked(revalidatePath).mock.calls.map(([path]) => path);

beforeEach(() => {
  fake.reset();
  vi.mocked(revalidatePath).mockClear();
});

describe("saveNutritionTargetAction", () => {
  it("PUTs the grams as typed for the trainee in the form", async () => {
    const result = await actions.saveNutritionTargetAction(
      INITIAL_FORM_STATE,
      toFormData({
        userId: "5",
        carbs: "235",
        protein: "160",
        fat: "55",
        note: "Giữ nguyên",
      }),
    );

    expect(result.status).toBe("success");
    expect(fake.requests).toEqual([
      expect.objectContaining({
        actor: "admin",
        method: "PUT",
        path: "/v1/trainees/{userId}/nutrition-target",
        params: { path: { userId: 5 } },
        body: { carbs: "235", protein: "160", fat: "55", note: "Giữ nguyên" },
      }),
    ]);
    expect(revalidated()).toEqual([
      "/nutrition",
      "/summary",
      "/admin/users/5/nutrition",
      "/admin",
    ]);
  });

  it("refuses bad grams before calling the API", async () => {
    const result = await actions.saveNutritionTargetAction(
      INITIAL_FORM_STATE,
      toFormData({ userId: "5", carbs: "x", protein: "160", fat: "55" }),
    );

    expect(result.status).toBe("error");
    expect(result.fieldErrors?.carbs).toBeTruthy();
    expect(fake.requests).toHaveLength(0);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("shows the API's refusal (a trainee outside the workspace)", async () => {
    fake.refuse(404, "NOT_FOUND", "Không tìm thấy học viên");

    const result = await actions.saveNutritionTargetAction(
      INITIAL_FORM_STATE,
      toFormData({ userId: "5", carbs: "235", protein: "160", fat: "55" }),
    );

    expect(result).toMatchObject({
      status: "error",
      message: "Không tìm thấy học viên",
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("saveFoodEntryAction", () => {
  const ENTRY = {
    date: "2026-11-02",
    meal: "lunch",
    description: "Cơm gà",
    carbs: "60",
    protein: "30",
    fat: "10",
  };

  it("POSTs a new entry", async () => {
    const result = await actions.saveFoodEntryAction(
      INITIAL_FORM_STATE,
      toFormData(ENTRY),
    );

    expect(result).toMatchObject({ status: "success" });
    expect(fake.requests).toEqual([
      expect.objectContaining({
        actor: "user",
        method: "POST",
        path: "/v1/me/food-entries",
        body: ENTRY,
      }),
    ]);
    expect(revalidated()).toContain("/nutrition");
  });

  it("PUTs an edit to the entry in the form", async () => {
    await actions.saveFoodEntryAction(
      INITIAL_FORM_STATE,
      toFormData({ ...ENTRY, entryId: "12" }),
    );

    expect(fake.requests[0]).toMatchObject({
      method: "PUT",
      path: "/v1/me/food-entries/{id}",
      params: { path: { id: 12 } },
    });
  });

  it("shows the API's message for an empty entry or a future day", async () => {
    fake.refuse(400, "ENTRY_EMPTY", "Nhập mô tả hoặc số gram");

    const result = await actions.saveFoodEntryAction(
      INITIAL_FORM_STATE,
      toFormData({
        ...ENTRY,
        description: "",
        carbs: "",
        protein: "",
        fat: "",
      }),
    );

    expect(result).toMatchObject({
      status: "error",
      message: "Nhập mô tả hoặc số gram",
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("refuses an invalid date before calling the API", async () => {
    const result = await actions.saveFoodEntryAction(
      INITIAL_FORM_STATE,
      toFormData({ ...ENTRY, date: "2026-13-40" }),
    );

    expect(result.status).toBe("error");
    expect(fake.requests).toHaveLength(0);
  });
});

describe("deleteFoodEntryAction", () => {
  it("DELETEs the entry and refreshes the pages", async () => {
    expect(await actions.deleteFoodEntryAction(12)).toEqual({
      status: "success",
    });
    expect(fake.requests[0]).toMatchObject({
      method: "DELETE",
      path: "/v1/me/food-entries/{id}",
      params: { path: { id: 12 } },
    });
    expect(revalidated()).toContain("/summary");
  });
});

describe("saveBodyProfileAction (PT)", () => {
  const BODY = {
    userId: "5",
    sex: "male",
    age: "30",
    heightCm: "175",
    weightKg: "72,5",
    activityLevel: "moderate",
    kcalAdjustment: "-200",
    proteinPerKg: "2",
  };

  it("sends the energy model with the decimal comma as typed", async () => {
    fake.reply({ targetApplied: true });

    const result = await actions.saveBodyProfileAction(
      INITIAL_FORM_STATE,
      toFormData({ ...BODY, applyToTarget: "on" }),
    );

    expect(result).toMatchObject({
      status: "success",
      message: "Đã lưu chỉ số và cập nhật mục tiêu theo TDEE",
    });
    expect(fake.requests[0]).toMatchObject({
      method: "PUT",
      path: "/v1/trainees/{userId}/body-profile",
      params: { path: { userId: 5 } },
      body: expect.objectContaining({
        weightKg: "72,5",
        kcalAdjustment: "-200",
        applyToTarget: true,
      }),
    });
  });

  it("does not apply the TDEE when the box is unticked", async () => {
    fake.reply({ targetApplied: false });

    const result = await actions.saveBodyProfileAction(
      INITIAL_FORM_STATE,
      toFormData(BODY),
    );

    expect(fake.requests[0].body).toMatchObject({ applyToTarget: false });
    expect(result).toMatchObject({
      status: "success",
      message: "Đã lưu chỉ số cơ thể",
    });
  });

  it("refuses out-of-range measurements before calling the API", async () => {
    const result = await actions.saveBodyProfileAction(
      INITIAL_FORM_STATE,
      toFormData({ ...BODY, age: "5" }),
    );

    expect(result.status).toBe("error");
    expect(result.fieldErrors?.age).toBeTruthy();
    expect(fake.requests).toHaveLength(0);
  });
});

describe("saveMyBodyProfileAction (trainee)", () => {
  const BODY = {
    sex: "female",
    age: "28",
    heightCm: "165",
    weightKg: "60",
    activityLevel: "light",
    goal: "maintain",
  };

  it("PUTs the measurements and says when the target stayed manual", async () => {
    fake.reply({ targetApplied: false });

    const result = await actions.saveMyBodyProfileAction(
      INITIAL_FORM_STATE,
      toFormData(BODY),
    );

    expect(fake.requests[0]).toMatchObject({
      actor: "user",
      method: "PUT",
      path: "/v1/me/body-profile",
      body: BODY,
    });
    expect(result.status).toBe("success");
    expect(result.message).toContain("giữ nguyên");
  });

  it("says the target followed the TDEE", async () => {
    fake.reply({ targetApplied: true });

    const result = await actions.saveMyBodyProfileAction(
      INITIAL_FORM_STATE,
      toFormData(BODY),
    );

    expect(result.message).toContain("TDEE");
  });
});

describe("logWeightAction", () => {
  it("PUTs today's weight as typed and picks the message from targetApplied", async () => {
    fake.reply({ targetApplied: true });

    const result = await actions.logWeightAction(
      INITIAL_FORM_STATE,
      toFormData({ weightKg: "72,5" }),
    );

    expect(fake.requests[0]).toMatchObject({
      method: "PUT",
      path: "/v1/me/weight-logs/{date}",
      body: { weightKg: "72,5" },
    });
    expect(fake.requests[0].params?.path?.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(result.message).toContain("mục tiêu");
    expect(revalidated()).toContain("/summary");
  });

  it("refuses text that is not a weight before calling the API", async () => {
    const result = await actions.logWeightAction(
      INITIAL_FORM_STATE,
      toFormData({ weightKg: "abc" }),
    );

    expect(result.status).toBe("error");
    expect(fake.requests).toHaveLength(0);
  });
});

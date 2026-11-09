import { describe, expect, it } from "vitest";

import { GENERIC_ERROR_MESSAGE } from "@/constants/errors";
import { AUTH_MESSAGES } from "@/features/auth/constants/messages";
import { AVATAR_MESSAGES } from "@/features/avatar/constants/messages";
import {
  CHAT_MESSAGES,
  HIDDEN_CHAT_MESSAGES,
  PRESENCE_MESSAGES,
} from "@/features/chat/constants/messages";
import { CUSTOM_STICKER_ERRORS } from "@/features/chat/utils/custom-sticker-rules";
import { PHOTO_ERRORS } from "@/features/chat/utils/photo-rules";
import { FOOD_MESSAGES } from "@/features/foods/constants/foods";
import { foodFormSchema } from "@/features/foods/services/food-schemas";
import {
  MEAL_LOG_MESSAGES,
  MEAL_PLAN_MESSAGES,
} from "@/features/meal-plans/constants/meal-plans";
import { MEMBER_MESSAGES } from "@/features/members/constants/messages";
import { NUTRITION_MESSAGES } from "@/features/nutrition/constants/nutrition";
import { PT_MESSAGES } from "@/features/pts/constants/messages";
import { DM_MESSAGES } from "@/features/social/constants/dm";
import {
  FRIEND_MESSAGES,
  SOCIAL_MESSAGES,
} from "@/features/social/constants/social";
import { WORKOUT_MESSAGES } from "@/features/workouts/constants/messages";
import { exerciseSchema } from "@/features/workouts/services/workout-schemas";
import { localizeMessageFor, localizeResultFor } from "@/i18n/localize-message";
import enErrors from "@/messages/en/errors.json";
import viErrors from "@/messages/vi/errors.json";
import { EMAIL_MESSAGES } from "@/utils/email";

const CONSTANTS: Record<string, Record<string, string>> = {
  AUTH_MESSAGES,
  AVATAR_MESSAGES,
  CHAT_MESSAGES,
  HIDDEN_CHAT_MESSAGES,
  PRESENCE_MESSAGES,
  CUSTOM_STICKER_ERRORS,
  PHOTO_ERRORS,
  FOOD_MESSAGES,
  MEAL_LOG_MESSAGES,
  MEAL_PLAN_MESSAGES,
  MEMBER_MESSAGES,
  NUTRITION_MESSAGES,
  PT_MESSAGES,
  DM_MESSAGES,
  FRIEND_MESSAGES,
  SOCIAL_MESSAGES,
  WORKOUT_MESSAGES,
  EMAIL_MESSAGES,
};

describe("localizeMessageFor", () => {
  it("returns Vietnamese text unchanged", () => {
    expect(localizeMessageFor("vi", AUTH_MESSAGES.CREDENTIALS_WRONG)).toBe(
      "Sai tài khoản hoặc mật khẩu",
    );
    expect(localizeMessageFor("vi", "Tối đa 10 ký tự")).toBe("Tối đa 10 ký tự");
  });

  it("translates a known message to English", () => {
    expect(localizeMessageFor("en", AUTH_MESSAGES.CREDENTIALS_WRONG)).toBe(
      "Wrong username or password",
    );
    expect(localizeMessageFor("en", GENERIC_ERROR_MESSAGE)).toBe(
      "Something went wrong. Please try again later.",
    );
  });

  it("translates messages that carry a limit", () => {
    expect(localizeMessageFor("en", MEMBER_MESSAGES.NAME_TOO_LONG)).toBe(
      "The name can have at most 60 characters",
    );
    expect(localizeMessageFor("en", DM_MESSAGES.TOO_LONG)).toBe(
      "Messages can have at most 2000 characters.",
    );
  });

  it("translates schema messages built from a field label", () => {
    expect(localizeMessageFor("en", "Nhập Tuổi")).toBe("Enter Age");
    expect(localizeMessageFor("en", "Cân nặng từ 20")).toBe(
      "Weight must be at least 20",
    );
    expect(localizeMessageFor("en", "Chất xơ tối đa 100")).toBe(
      "Fiber can be at most 100",
    );
    expect(localizeMessageFor("en", "Số kcal từ -1000")).toBe(
      "Kcal must be at least -1000",
    );
  });

  it("passes unknown text through unchanged", () => {
    expect(localizeMessageFor("en", "Something already English")).toBe(
      "Something already English",
    );
    expect(localizeMessageFor("en", "Nhập một thứ lạ")).toBe("Nhập một thứ lạ");
    expect(localizeMessageFor("en", "")).toBe("");
  });

  it("translates the messages the Zod schemas produce", () => {
    const exercise = exerciseSchema.safeParse({
      userId: "1",
      date: "2026-01-05",
      title: "",
      youtubeUrl: "not a link",
    });
    const food = foodFormSchema.safeParse({ name: "", kcal: "" });
    const issues = [exercise, food].flatMap((result) =>
      result.success ? [] : result.error.issues.map((issue) => issue.message),
    );

    expect(issues).toContain("Nhập tên bài tập");
    expect(issues).toContain("Nhập Calo");
    for (const message of issues) {
      expect(localizeMessageFor("en", message), message).not.toMatch(
        /[ăâđêôơưÀ-ỹ]/,
      );
    }
  });

  it("covers every message constant in the errors namespace", () => {
    for (const [name, group] of Object.entries(CONSTANTS)) {
      for (const [key, text] of Object.entries(group)) {
        const english = localizeMessageFor("en", text);

        expect(english, `${name}.${key}`).not.toBe(text);
        expect(english, `${name}.${key}`).not.toMatch(/[ăâđêôơưÀ-ỹ]/);
      }
    }
  });

  it("keeps the vi errors file equal to the constants", () => {
    const vi = viErrors as Record<string, Record<string, string>>;

    expect(vi.auth).toEqual(AUTH_MESSAGES);
    expect(vi.photo).toEqual(PHOTO_ERRORS);
    expect(vi.generic.default).toBe(GENERIC_ERROR_MESSAGE);
    expect(vi.workouts).toEqual(WORKOUT_MESSAGES);
    expect(vi.members.PASSWORD_ONCE).toBe(MEMBER_MESSAGES.PASSWORD_ONCE);
  });

  it("renders every plain message of the namespace in English", () => {
    const vi = viErrors as Record<string, Record<string, string>>;
    const en = enErrors as Record<string, Record<string, string>>;

    for (const [group, messages] of Object.entries(vi)) {
      if (group === "reference" || group === "toasts") {
        continue;
      }
      for (const [key, text] of Object.entries(messages)) {
        if (!text.includes("{")) {
          expect(localizeMessageFor("en", text), `${group}.${key}`).toBe(
            en[group][key],
          );
        }
      }
    }
  });
});

describe("localizeResultFor", () => {
  it("leaves a Vietnamese result untouched", () => {
    const result = { status: "error", message: AUTH_MESSAGES.PASSCODE_WRONG };

    expect(localizeResultFor("vi", result)).toBe(result);
  });

  it("translates message and fieldErrors, nothing else", () => {
    const result = {
      status: "error" as const,
      message: AUTH_MESSAGES.PASSCODE_WRONG,
      fieldErrors: { name: MEMBER_MESSAGES.NAME_REQUIRED, other: undefined },
      values: { name: "Mã khoá không đúng" },
    };

    expect(localizeResultFor("en", result)).toEqual({
      status: "error",
      message: "Wrong passcode",
      fieldErrors: { name: "Enter the user name", other: undefined },
      values: { name: "Mã khoá không đúng" },
    });
  });

  it("keeps a non-text message (a chat message object) as it is", () => {
    const result = { status: "success", message: { id: 1, body: "Xin chào" } };

    expect(localizeResultFor("en", result)).toEqual(result);
  });
});

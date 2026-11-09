import { beforeEach, describe, expect, it, vi } from "vitest";

const { getLocale } = vi.hoisted(() => ({ getLocale: vi.fn() }));

vi.mock("next-intl/server", () => ({ getLocale }));

import { AUTH_MESSAGES } from "@/features/auth/constants/messages";
import {
  getActiveLocale,
  getErrorsTranslator,
  localizeMessage,
  localizeResult,
} from "@/services/localize-message";

describe("localize-message (server)", () => {
  beforeEach(() => {
    getLocale.mockReset();
  });

  it("passes Vietnamese through in the default locale", async () => {
    getLocale.mockResolvedValue("vi");

    expect(await localizeMessage(AUTH_MESSAGES.PASSCODE_WRONG)).toBe(
      "Mã khoá không đúng",
    );
  });

  it("translates in English", async () => {
    getLocale.mockResolvedValue("en");

    expect(await localizeMessage(AUTH_MESSAGES.PASSCODE_WRONG)).toBe(
      "Wrong passcode",
    );
    expect(await localizeMessage("Not a known message")).toBe(
      "Not a known message",
    );
    expect(
      await localizeResult({ status: "error", message: "Mật khẩu không đúng" }),
    ).toEqual({ status: "error", message: "Wrong password" });
  });

  it("falls back to Vietnamese outside a request", async () => {
    getLocale.mockRejectedValue(new Error("no request"));

    expect(await getActiveLocale()).toBe("vi");
    expect(await localizeMessage(AUTH_MESSAGES.PASSCODE_WRONG)).toBe(
      AUTH_MESSAGES.PASSCODE_WRONG,
    );
  });

  it("builds interpolated messages in the active locale", async () => {
    getLocale.mockResolvedValue("en");
    expect(
      (await getErrorsTranslator())("toasts.memberAdded", { name: "An" }),
    ).toBe("Added An");

    getLocale.mockResolvedValue("vi");
    expect(
      (await getErrorsTranslator())("toasts.memberAdded", { name: "An" }),
    ).toBe("Đã thêm An");
    expect(
      (await getErrorsTranslator())("toasts.weekCopiedTo", {
        count: 3,
        range: "05/10 – 11/10",
        name: "An",
      }),
    ).toBe("Đã sao chép 3 ngày sang tuần 05/10 – 11/10 của An");
  });
});

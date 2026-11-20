import { beforeEach, describe, expect, it, vi } from "vitest";

import { INITIAL_FORM_STATE } from "@/constants/form";
import { ApiError } from "@/services/api/errors";
import type { FakeApi } from "@/services/api/testing";
import { apiRefusal } from "@/services/api/testing";

// Spec D4 on the web side: the API refuses a suspended trainee's login after
// the right password (ACCOUNT_SUSPENDED, apps/api/test/restrictions.e2e.test.ts);
// the login form shows the end and the reason in the request's language.

const state = vi.hoisted(() => ({
  fake: null as FakeApi | null,
  locale: "vi" as string,
}));
const fake = () => state.fake as FakeApi;

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  unstable_rethrow: vi.fn(),
}));
vi.mock("next-intl/server", () => ({
  getLocale: vi.fn(async () => state.locale),
}));
vi.mock("@/services/logger", () => ({
  logServerError: vi.fn(() => ({ code: "UNKNOWN" })),
}));
vi.mock("@/services/session", () => ({
  startSession: vi.fn(),
  endSession: vi.fn(),
}));
vi.mock("@/services/locale-cookie", () => ({ applyStoredLocale: vi.fn() }));
vi.mock("@/services/api/call", async () => {
  const { createFakeApi } = await import("@/services/api/testing");

  state.fake = createFakeApi();
  return {
    callApi: state.fake.callApi,
    tryApi: state.fake.tryApi,
    runApi: vi.fn(),
  };
});

const { startSession } = await import("@/services/session");
const { loginWithEmailAction } =
  await import("@/features/auth/services/auth-actions");

const login = () => {
  const formData = new FormData();

  formData.set("email", "an@example.com");
  formData.set("password", "right-password");
  return loginWithEmailAction(INITIAL_FORM_STATE, formData);
};

const suspended = (details: Record<string, string | boolean>) =>
  new ApiError({
    status: 403,
    code: "ACCOUNT_SUSPENDED",
    message: "Tài khoản của bạn đã bị khoá (API)",
    ref: "ref-test",
    details,
  });

beforeEach(() => {
  vi.clearAllMocks();
  fake().reset();
  state.locale = "vi";
});

describe("loginWithEmailAction for a suspended trainee", () => {
  it("shows the end in Vietnam time and the reason, and starts no session", async () => {
    fake().respond = () => {
      // 10:00 UTC is 17:00 in Ho Chi Minh City.
      throw suspended({
        reason: "spam",
        permanent: false,
        until: "2026-11-21T10:00:00.000Z",
      });
    };

    const result = await login();

    expect(result.status).toBe("error");
    expect(result.message).toMatch(
      /^Tài khoản của bạn đã bị khoá đến .*17:00.*\. Lý do: spam$/,
    );
    expect(result.values).toEqual({ email: "an@example.com" });
    expect(startSession).not.toHaveBeenCalled();
  });

  it("says permanent, in English for an English request", async () => {
    state.locale = "en";
    fake().respond = () => {
      throw suspended({ reason: "spam", permanent: true });
    };

    expect((await login()).message).toBe(
      "Your account is suspended permanently. Reason: spam",
    );
  });

  it("keeps the API text for other refusals (a wrong password reveals nothing)", async () => {
    fake().respond = () => {
      throw apiRefusal(401, "INVALID_CREDENTIALS", "Email hoặc mật khẩu sai");
    };

    const result = await login();

    expect(result.status).toBe("error");
    expect(result.message).toBe("Email hoặc mật khẩu sai");
  });
});

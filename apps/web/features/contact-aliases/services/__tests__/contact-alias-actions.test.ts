import { revalidatePath } from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ALIAS_MESSAGES } from "@/features/contact-aliases/constants/messages";
import type { FakeApi } from "@/services/api/testing";
import { apiRefusal } from "@/services/api/testing";

const state = vi.hoisted(() => ({ fake: null as FakeApi | null }));
const fake = () => state.fake as FakeApi;

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/services/logger", () => ({ logServerError: vi.fn(() => ({ code: "UNKNOWN" })) }));
vi.mock("@/services/api/call", async () => {
  const { createFakeApi } = await import("@/services/api/testing");

  state.fake = createFakeApi();
  return { callApi: state.fake.callApi, tryApi: state.fake.tryApi };
});
vi.mock("@/services/auth-guard", () => ({
  requireUser: vi.fn(async () => ({ id: 4 })),
  requireAdmin: vi.fn(async () => ({ id: 2 })),
}));

const actions =
  await import("@/features/contact-aliases/services/contact-alias-actions");

// The API echoes what it stored.
const echo = ({ init }: { init: { body?: unknown } }) => ({
  alias: (init.body as { alias: string }).alias,
});

beforeEach(() => {
  vi.clearAllMocks();
  fake().reset();
  fake().respond = echo;
});

// Who may be named (scope, hidden, blocked, terms), the owner taken from the
// session and clearing for a gone account are the API's:
// apps/api/test/profile-and-aliases.e2e.test.ts ("contact aliases").
describe("setContactAliasAction (trainee)", () => {
  it("sends the alias to the API with the trainee's session and answers with the stored value", async () => {
    for (const [targetKey, alias] of [
      ["pt", "Thầy"],
      ["admin:1", "Thầy Hoan"],
      ["user:7", "Bé Bin"],
    ]) {
      expect(await actions.setContactAliasAction({ targetKey, alias })).toEqual(
        { status: "success", targetKey, alias },
      );
    }
    expect(fake().calls).toMatchObject([
      {
        actor: "user",
        method: "PUT",
        path: "/v1/contact-aliases/{targetKey}",
        init: {
          params: { path: { targetKey: "pt" } },
          body: { alias: "Thầy" },
        },
      },
      { init: { params: { path: { targetKey: "admin:1" } } } },
      { init: { params: { path: { targetKey: "user:7" } } } },
    ]);
  });

  it("trims and collapses whitespace before sending", async () => {
    await actions.setContactAliasAction({
      targetKey: "pt",
      alias: "  Big   Coach ",
    });

    expect(fake().calls[0].init.body).toEqual({ alias: "Big Coach" });
  });

  it("accepts exactly 30 characters and rejects 31 without calling the API", async () => {
    const ok = "ê".repeat(30);

    expect(
      await actions.setContactAliasAction({ targetKey: "pt", alias: ok }),
    ).toMatchObject({ status: "success" });
    expect(
      await actions.setContactAliasAction({ targetKey: "pt", alias: `${ok}x` }),
    ).toEqual({ status: "error", message: ALIAS_MESSAGES.INVALID });
    expect(fake().calls).toHaveLength(1);
  });

  it.each([
    ["a conversation key", { targetKey: "user", alias: "x" }],
    ["an unknown target", { targetKey: "everyone", alias: "x" }],
    ["an admin without id", { targetKey: "admin:", alias: "x" }],
    ["id zero", { targetKey: "user:0", alias: "x" }],
    ["control characters", { targetKey: "pt", alias: "a\u0000b" }],
    ["a non-string alias", { targetKey: "pt", alias: 5 }],
    ["no input", undefined],
    ["null input", null],
  ])("rejects bad input before the API: %s", async (_label, input) => {
    const result = await actions.setContactAliasAction(
      input as { targetKey: string; alias: string },
    );

    expect(result.status).toBe("error");
    expect(fake().calls).toEqual([]);
  });

  it("shows the API's reason when the target is refused", async () => {
    for (const [code, message, status] of [
      ["ALIAS_SELF", ALIAS_MESSAGES.SELF, 400],
      ["ALIAS_TARGET_NOT_FOUND", ALIAS_MESSAGES.TARGET_NOT_FOUND, 404],
    ] as const) {
      fake().respond = () => {
        throw apiRefusal(status, code, message);
      };

      expect(
        await actions.setContactAliasAction({
          targetKey: "user:4",
          alias: "x",
        }),
      ).toEqual({ status: "error", message });
    }
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("clears with an empty alias", async () => {
    expect(
      await actions.setContactAliasAction({
        targetKey: "admin:9999",
        alias: "  ",
      }),
    ).toEqual({ status: "success", targetKey: "admin:9999", alias: "" });
  });

  it("refreshes the layout after a save, not after a refusal", async () => {
    await actions.setContactAliasAction({ targetKey: "pt", alias: "Coach" });

    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  });
});

describe("adminSetContactAliasAction", () => {
  it("sends the alias with the admin's session", async () => {
    expect(
      await actions.adminSetContactAliasAction({
        targetKey: "user:4",
        alias: "Bé Na",
      }),
    ).toEqual({ status: "success", targetKey: "user:4", alias: "Bé Na" });
    expect(fake().calls).toMatchObject([
      { actor: "admin", path: "/v1/contact-aliases/{targetKey}" },
    ]);
  });

  it("shows the same 'not found' for a trainee outside the workspace or a hidden one", async () => {
    fake().respond = () => {
      throw apiRefusal(
        404,
        "ALIAS_TARGET_NOT_FOUND",
        ALIAS_MESSAGES.TARGET_NOT_FOUND,
      );
    };

    expect(
      await actions.adminSetContactAliasAction({
        targetKey: "user:9",
        alias: "Bé Bin",
      }),
    ).toEqual({ status: "error", message: ALIAS_MESSAGES.TARGET_NOT_FOUND });
  });

  it("rejects bad input before the API", async () => {
    for (const input of [
      { targetKey: "everyone", alias: "x" },
      { targetKey: "user:4", alias: "x".repeat(31) },
      null,
    ]) {
      expect(
        (
          await actions.adminSetContactAliasAction(
            input as { targetKey: string; alias: string },
          )
        ).status,
      ).toBe("error");
    }
    expect(fake().calls).toEqual([]);
  });
});

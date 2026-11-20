import { GROUP_MESSAGES } from "@pt/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AVATAR_MESSAGES } from "@/features/avatar/constants/messages";
import { AVATAR_MAX_DATA_URL_LENGTH } from "@/features/avatar/utils/avatar-rules";

// The group info and create screens' server actions (company group-core:
// create, add, remove, rename, photo, managers-only, mute, leave, dissolve)
// are a thin BFF over /v1/chat/groups. The API's own rules (scope, cap,
// managers, super admins) are tested in apps/api/test/chat-groups*.e2e.test.ts;
// here: the session check, the input check, what reaches the API and how its
// refusals read.

const state = vi.hoisted(() => ({
  calls: [] as { actor: string; method: string; path: string; init: unknown }[],
  answers: [] as { status: number; body?: unknown }[],
  guards: [] as string[],
}));

vi.mock("server-only", () => ({}));
vi.mock("@/services/session", () => ({ readSessionToken: vi.fn() }));
vi.mock("@/services/api/client", () => {
  const answer =
    (actor: string, method: string) => async (path: string, init: unknown) => {
      state.calls.push({ actor, method, path, init });
      const next = state.answers.shift() ?? { status: 200, body: {} };
      const ok = next.status < 400;

      return {
        response: new Response(null, { status: next.status }),
        data: ok ? next.body : undefined,
        error: ok ? undefined : next.body,
      };
    };

  return {
    apiClient: vi.fn(async (actor: string) => ({
      GET: answer(actor, "GET"),
      POST: answer(actor, "POST"),
      PUT: answer(actor, "PUT"),
      PATCH: answer(actor, "PATCH"),
      DELETE: answer(actor, "DELETE"),
    })),
    currentRequestId: vi.fn(async () => "req-1"),
  };
});
vi.mock("@/services/api/call", async () => {
  const { ApiError } = await import("@/services/api/errors");
  const client = await import("@/services/api/client");

  return {
    tryApi: vi.fn(
      async (
        actor: string,
        call: (api: unknown) => Promise<{
          response: Response;
          data?: unknown;
          error?: unknown;
        }>,
      ) => {
        const result = await call(await client.apiClient(actor as never));
        const body = result.error as {
          code: string;
          message: string;
          details?: Record<string, string>;
        };

        return result.response.ok
          ? { ok: true, data: result.data }
          : {
              ok: false,
              error: new ApiError({
                status: result.response.status,
                code: body.code,
                message: body.message,
                details: body.details,
              }),
            };
      },
    ),
  };
});
vi.mock("@/services/auth-guard", () => ({
  requireUser: vi.fn(async () => {
    state.guards.push("user");
    return { id: 5 };
  }),
  requireAdmin: vi.fn(async () => {
    state.guards.push("admin");
    return { id: 1 };
  }),
  requireSuperAdmin: vi.fn(async () => {
    state.guards.push("super_admin");
    return { id: 1 };
  }),
}));
vi.mock("@/services/action-errors", () => ({
  withResultErrorHandling: (_name: string, fn: (...args: never[]) => unknown) =>
    fn,
}));

const actions = await import("@/features/chat-groups/services/group-actions");

const refusal = (status: number, code: string, message: string) => ({
  status,
  body: { code, message, ref: "r1" },
});

beforeEach(() => {
  state.calls = [];
  state.answers = [];
  state.guards = [];
});

describe("createGroupAction", () => {
  it("checks the admin session, sends the trimmed name and the ids, and returns the per-id results", async () => {
    const results = [
      { kind: "user", id: 7, outcome: "added" },
      { kind: "user", id: 99, outcome: "out_of_scope" },
      { kind: "admin", id: 4, outcome: "added" },
    ];

    state.answers.push({ status: 201, body: { groupId: 12, results } });

    const result = await actions.createGroupAction({
      name: "  Lớp   sáng ",
      userIds: [7, 99],
      ptIds: [4],
    });

    expect(state.guards).toEqual(["admin"]);
    expect(state.calls).toEqual([
      {
        actor: "admin",
        method: "POST",
        path: "/v1/chat/groups",
        init: { body: { name: "Lớp sáng", userIds: [7, 99], ptIds: [4] } },
      },
    ]);
    expect(result).toEqual({ status: "success", groupId: 12, results });
  });

  it("refuses an empty or too long name with the name rule and calls nothing", async () => {
    for (const name of ["   ", "x".repeat(61), 42]) {
      expect(await actions.createGroupAction({ name, userIds: [] })).toEqual({
        status: "error",
        message: GROUP_MESSAGES.NAME_INVALID,
      });
    }
    expect(await actions.createGroupAction(null)).toEqual({
      status: "error",
      message: GROUP_MESSAGES.INVALID_INPUT,
    });
    expect(state.calls).toEqual([]);
  });

  it("shows the API's refusal by its code", async () => {
    state.answers.push(
      refusal(400, "GROUP_NAME_INVALID", "Tên nhóm không hợp lệ (API)"),
    );

    expect(await actions.createGroupAction({ name: "Lớp" })).toEqual({
      status: "error",
      message: GROUP_MESSAGES.NAME_INVALID,
    });
  });
});

describe("addGroupMembersAction", () => {
  it("adds as admin to the group in the path, keeping groupId out of the body", async () => {
    const results = [{ kind: "user", id: 8, outcome: "added" }];

    state.answers.push({ status: 200, body: { results } });

    const result = await actions.addGroupMembersAction({
      groupId: 3,
      userIds: [8],
    });

    expect(state.guards).toEqual(["admin"]);
    expect(state.calls).toEqual([
      {
        actor: "admin",
        method: "POST",
        path: "/v1/chat/groups/{groupId}/members",
        init: {
          params: { path: { groupId: 3 } },
          body: { userIds: [8], ptIds: [] },
        },
      },
    ]);
    expect(result).toEqual({ status: "success", results });
  });

  it("reads 409 GROUP_FULL and 403 GROUP_NOT_MANAGER as the group texts", async () => {
    state.answers.push(refusal(409, "GROUP_FULL", "full"));
    expect(
      await actions.addGroupMembersAction({ groupId: 3, userIds: [8] }),
    ).toEqual({ status: "error", message: GROUP_MESSAGES.GROUP_FULL });

    state.answers.push(refusal(403, "GROUP_NOT_MANAGER", "not manager"));
    expect(
      await actions.addGroupMembersAction({ groupId: 3, userIds: [8] }),
    ).toEqual({ status: "error", message: GROUP_MESSAGES.NOT_MANAGER });
  });

  it("refuses a bad group id or too many ids before the API", async () => {
    for (const input of [
      { groupId: 0, userIds: [8] },
      { groupId: "3", userIds: [8] },
      { groupId: 3, userIds: Array.from({ length: 101 }, (_, i) => i + 1) },
    ]) {
      expect(await actions.addGroupMembersAction(input)).toEqual({
        status: "error",
        message: GROUP_MESSAGES.INVALID_INPUT,
      });
    }
    expect(state.calls).toEqual([]);
  });
});

describe("removeGroupMemberAction", () => {
  it("removes a member key as admin", async () => {
    state.answers.push({ status: 204 });

    expect(
      await actions.removeGroupMemberAction({
        groupId: 3,
        memberKey: "user:8",
      }),
    ).toEqual({ status: "success" });
    expect(state.guards).toEqual(["admin"]);
    expect(state.calls).toEqual([
      {
        actor: "admin",
        method: "DELETE",
        path: "/v1/chat/groups/{groupId}/members/{memberKey}",
        init: { params: { path: { groupId: 3, memberKey: "user:8" } } },
      },
    ]);
  });

  it("refuses a malformed key and reads a manager's 403", async () => {
    for (const memberKey of ["user:", "super:1", "user:1/../2", "user:0"]) {
      expect(
        await actions.removeGroupMemberAction({ groupId: 3, memberKey }),
      ).toEqual({ status: "error", message: GROUP_MESSAGES.INVALID_INPUT });
    }
    expect(state.calls).toEqual([]);

    state.answers.push(refusal(403, "GROUP_CANNOT_REMOVE_MANAGER", "no"));
    expect(
      await actions.removeGroupMemberAction({
        groupId: 3,
        memberKey: "admin:1",
      }),
    ).toEqual({
      status: "error",
      message: GROUP_MESSAGES.CANNOT_REMOVE_MANAGER,
    });
  });
});

describe("renameGroupAction", () => {
  it("puts the normalized name", async () => {
    state.answers.push({ status: 204 });

    expect(
      await actions.renameGroupAction({ groupId: 3, name: " Lớp  tối " }),
    ).toEqual({ status: "success" });
    expect(state.calls[0]).toEqual({
      actor: "admin",
      method: "PUT",
      path: "/v1/chat/groups/{groupId}/name",
      init: { params: { path: { groupId: 3 } }, body: { name: "Lớp tối" } },
    });
  });

  it("refuses an empty name and passes a 404 on as not found", async () => {
    expect(await actions.renameGroupAction({ groupId: 3, name: " " })).toEqual({
      status: "error",
      message: GROUP_MESSAGES.NAME_INVALID,
    });
    expect(state.calls).toEqual([]);

    state.answers.push(refusal(404, "GROUP_NOT_FOUND", "gone"));
    expect(
      await actions.renameGroupAction({ groupId: 3, name: "Lớp" }),
    ).toEqual({ status: "error", message: GROUP_MESSAGES.GROUP_NOT_FOUND });
  });
});

describe("setGroupAvatarAction", () => {
  const DATA_URL = "data:image/webp;base64,UklGRg==";

  it("puts the data URL and maps the signed photo URL to this app", async () => {
    state.answers.push({
      status: 200,
      body: { avatarUrl: "/v1/chat/groups/3/avatar?v=5&t=sig" },
    });

    expect(
      await actions.setGroupAvatarAction({ groupId: 3, dataUrl: DATA_URL }),
    ).toEqual({
      status: "success",
      avatarUrl: "/api/chat/groups/3/avatar?v=5&t=sig",
    });
    expect(state.calls[0]).toEqual({
      actor: "admin",
      method: "PUT",
      path: "/v1/chat/groups/{groupId}/avatar",
      init: { params: { path: { groupId: 3 } }, body: { dataUrl: DATA_URL } },
    });
  });

  it("clears the photo with null", async () => {
    state.answers.push({ status: 200, body: { avatarUrl: null } });

    expect(
      await actions.setGroupAvatarAction({ groupId: 3, dataUrl: null }),
    ).toEqual({ status: "success", avatarUrl: null });
    expect(state.calls[0]).toMatchObject({
      actor: "admin",
      method: "DELETE",
      path: "/v1/chat/groups/{groupId}/avatar",
    });
  });

  it("refuses an oversized photo before the API and reads the API's photo refusals", async () => {
    expect(
      await actions.setGroupAvatarAction({
        groupId: 3,
        dataUrl: "x".repeat(AVATAR_MAX_DATA_URL_LENGTH + 1),
      }),
    ).toEqual({ status: "error", message: AVATAR_MESSAGES.TOO_LARGE });
    expect(
      await actions.setGroupAvatarAction({ groupId: 3, dataUrl: "" }),
    ).toEqual({ status: "error", message: GROUP_MESSAGES.INVALID_INPUT });
    expect(state.calls).toEqual([]);

    state.answers.push(refusal(400, "AVATAR_INVALID", "bad"));
    expect(
      await actions.setGroupAvatarAction({ groupId: 3, dataUrl: DATA_URL }),
    ).toEqual({ status: "error", message: AVATAR_MESSAGES.INVALID });

    state.answers.push(refusal(413, "AVATAR_TOO_LARGE", "big"));
    expect(
      await actions.setGroupAvatarAction({ groupId: 3, dataUrl: DATA_URL }),
    ).toEqual({ status: "error", message: AVATAR_MESSAGES.TOO_LARGE });
  });
});

describe("setGroupManagersOnlyAction", () => {
  it("puts the switch as admin and refuses a non boolean", async () => {
    state.answers.push({ status: 204 });

    expect(
      await actions.setGroupManagersOnlyAction({ groupId: 3, enabled: true }),
    ).toEqual({ status: "success" });
    expect(state.calls[0]).toEqual({
      actor: "admin",
      method: "PUT",
      path: "/v1/chat/groups/{groupId}/managers-only",
      init: { params: { path: { groupId: 3 } }, body: { enabled: true } },
    });

    expect(
      await actions.setGroupManagersOnlyAction({ groupId: 3, enabled: "on" }),
    ).toEqual({ status: "error", message: GROUP_MESSAGES.INVALID_INPUT });
    expect(state.calls).toHaveLength(1);
  });
});

describe("mute and leave", () => {
  it("mute and leave use the trainee session for the trainee actions", async () => {
    state.answers.push({ status: 204 }, { status: 204 });

    expect(
      await actions.setGroupMutedAction({ groupId: 3, muted: true }),
    ).toEqual({ status: "success" });
    expect(await actions.leaveGroupAction({ groupId: 3 })).toEqual({
      status: "success",
    });
    expect(state.guards).toEqual(["user", "user"]);
    expect(state.calls).toEqual([
      {
        actor: "user",
        method: "PUT",
        path: "/v1/chat/groups/{groupId}/mute",
        init: { params: { path: { groupId: 3 } }, body: { muted: true } },
      },
      {
        actor: "user",
        method: "POST",
        path: "/v1/chat/groups/{groupId}/leave",
        init: { params: { path: { groupId: 3 } } },
      },
    ]);
  });

  it("the admin versions send as admin, and a super admin's leave is refused by the API", async () => {
    state.answers.push(
      { status: 204 },
      refusal(403, "GROUP_MANAGER_CANNOT_LEAVE", "no"),
    );

    expect(
      await actions.adminSetGroupMutedAction({ groupId: 3, muted: false }),
    ).toEqual({ status: "success" });
    expect(await actions.adminLeaveGroupAction({ groupId: 3 })).toEqual({
      status: "error",
      message: GROUP_MESSAGES.MANAGER_CANNOT_LEAVE,
    });
    expect(state.guards).toEqual(["admin", "admin"]);
    expect(state.calls.map((call) => call.actor)).toEqual(["admin", "admin"]);
  });

  it("refuses a bad input before the API", async () => {
    expect(
      await actions.setGroupMutedAction({ groupId: 3, muted: "yes" }),
    ).toEqual({ status: "error", message: GROUP_MESSAGES.INVALID_INPUT });
    expect(await actions.leaveGroupAction({ groupId: -1 })).toEqual({
      status: "error",
      message: GROUP_MESSAGES.INVALID_INPUT,
    });
    expect(state.calls).toEqual([]);
  });
});

describe("dissolveGroupAction", () => {
  it("needs a super admin and deletes the group", async () => {
    state.answers.push({ status: 204 });

    expect(await actions.dissolveGroupAction({ groupId: 3 })).toEqual({
      status: "success",
    });
    expect(state.guards).toEqual(["super_admin"]);
    expect(state.calls).toEqual([
      {
        actor: "admin",
        method: "DELETE",
        path: "/v1/chat/groups/{groupId}",
        init: { params: { path: { groupId: 3 } } },
      },
    ]);
  });

  it("stops at the guard: a PT never reaches the API", async () => {
    const guard = await import("@/services/auth-guard");

    vi.mocked(guard.requireSuperAdmin).mockRejectedValueOnce(
      new Error("NEXT_REDIRECT"),
    );

    await expect(actions.dissolveGroupAction({ groupId: 3 })).rejects.toThrow(
      "NEXT_REDIRECT",
    );
    expect(state.calls).toEqual([]);
  });
});

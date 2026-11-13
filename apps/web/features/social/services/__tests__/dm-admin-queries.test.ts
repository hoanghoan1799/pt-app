import { beforeEach, describe, expect, it, vi } from "vitest";

import type { FakeApi } from "@/services/api/testing";
import { apiRefusal } from "@/services/api/testing";

// The super admin's read-only trainee chats come from the API. Who may read
// them (super admin only, a PT gets 403/404) and the wording of names and
// previews are the API's: apps/api/test/dm.e2e.test.ts
// ("GET /v1/admin/dm/conversations", "opens for the two members and a super
// admin").

const state = vi.hoisted(() => ({ fake: null as FakeApi | null }));
const fake = () => state.fake as FakeApi;

vi.mock("server-only", () => ({}));
vi.mock("@/services/api/call", async () => {
  const { createFakeApi } = await import("@/services/api/testing");

  state.fake = createFakeApi();
  return { callApi: state.fake.callApi, tryApi: state.fake.tryApi };
});

const { listAllDmConversations, loadAdminDmThread } =
  await import("@/features/social/services/dm-admin-queries");

beforeEach(() => {
  fake().reset();
});

describe("listAllDmConversations", () => {
  it("returns the API rows with the last message time as a Date", async () => {
    fake().respond = () => ({
      conversations: [
        {
          id: 4,
          lowName: "An",
          highName: "Bình",
          lastMessageAt: "2026-11-02T10:00:00.000Z",
          preview: "chào",
        },
        {
          id: 5,
          lowName: "Cúc",
          highName: "Đã xoá",
          lastMessageAt: null,
          preview: "",
        },
      ],
    });

    expect(await listAllDmConversations()).toEqual([
      {
        id: 4,
        lowName: "An",
        highName: "Bình",
        lastMessageAt: new Date("2026-11-02T10:00:00.000Z"),
        preview: "chào",
      },
      {
        id: 5,
        lowName: "Cúc",
        highName: "Đã xoá",
        lastMessageAt: null,
        preview: "",
      },
    ]);
    expect(fake().calls).toMatchObject([
      { actor: "admin", method: "GET", path: "/v1/admin/dm/conversations" },
    ]);
  });
});

describe("loadAdminDmThread", () => {
  it("reads the thread as the admin and maps member names and photo URLs", async () => {
    fake().respond = () => ({
      messages: [
        {
          id: 1,
          senderId: 7,
          body: null,
          photo: { url: "/v1/dm/photos/3", width: 4, height: 3 },
          post: null,
          clientId: "c1",
          createdAt: "2026-11-02T10:00:00.000Z",
        },
      ],
      deletedIds: [],
      hasMore: false,
      otherReadUpTo: 0,
      readOnlyReason: null,
      isReadOnly: true,
      members: [
        { id: 7, name: "An" },
        { id: 9, name: null },
      ],
    });
    const result = await loadAdminDmThread(12, 40);

    expect(result?.thread.messages[0].photo?.url).toBe("/api/dm/photos/3");
    expect(result?.names).toEqual(new Map([[7, "An"]]));
    expect(result?.memberIds).toEqual([7, 9]);
    expect(fake().calls).toMatchObject([
      {
        actor: "admin",
        path: "/v1/dm/conversations/{cid}/messages",
        init: { params: { path: { cid: 12 }, query: { before: 40 } } },
      },
    ]);
  });

  it("is null for a conversation the API answers 404 for", async () => {
    fake().respond = () => {
      throw apiRefusal(404, "NOT_FOUND", "nope");
    };

    expect(await loadAdminDmThread(99)).toBeNull();
  });
});

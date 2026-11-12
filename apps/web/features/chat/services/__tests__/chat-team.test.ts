import { beforeEach, describe, expect, it, vi } from "vitest";

import type { FakeApi } from "@/services/api/testing";

// Which admins have a photo or the blue tick is the API's:
// apps/api/test/chat.e2e.test.ts ("GET /v1/chat/team").

const state = vi.hoisted(() => ({ fake: null as FakeApi | null }));
const fake = () => state.fake as FakeApi;

vi.mock("server-only", () => ({}));
vi.mock("react", () => ({ cache: <T>(fn: T) => fn }));
vi.mock("@/services/api/call", async () => {
  const { createFakeApi } = await import("@/services/api/testing");

  state.fake = createFakeApi();
  return { callApi: state.fake.callApi, tryApi: state.fake.tryApi };
});

const { listAdminAvatarUrls, listVerifiedAdminIds } =
  await import("@/features/chat/services/chat-team");

beforeEach(() => {
  fake().reset();
  fake().respond = () => ({
    admins: [
      { id: 1, avatarUrl: "/v1/avatars/admin/1?v=5", verified: false },
      { id: 2, avatarUrl: null, verified: true },
    ],
  });
});

describe("chat team", () => {
  it("maps photo URLs to this app's avatar route, keyed by admin id", async () => {
    expect(await listAdminAvatarUrls("user")).toEqual(
      new Map([[1, "/api/avatar/admin/1?v=5"]]),
    );
    expect(fake().calls[0]).toMatchObject({
      actor: "user",
      path: "/v1/chat/team",
    });
  });

  it("lists the ids with the blue tick", async () => {
    expect(await listVerifiedAdminIds("admin")).toEqual([2]);
  });
});

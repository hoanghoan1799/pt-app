import { beforeEach, describe, expect, it, vi } from "vitest";

// Who may be a bubble (chat on, workspace, hidden) is the API's rule, tested in
// apps/api/test/chat.e2e.test.ts. Here: its answer becomes the bubble host's
// shape, with this app's links and file paths.

const state = vi.hoisted(() => ({
  asked: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/features/chat/services/chat-api", () => ({
  askApi: state.asked,
}));

const meta = await import("@/features/chat-bubbles/services/bubble-meta");

beforeEach(() => {
  state.asked.mockReset();
});

describe("loadTraineeBubbles", () => {
  it("asks for the listed ids and maps each bubble", async () => {
    state.asked.mockImplementation(async (_actor, call) => {
      const get = vi.fn(async () => ({
        response: new Response(null, { status: 200 }),
        data: {
          bubbles: [
            {
              userId: 4,
              conversationId: 9,
              name: "Bé Na",
              avatarUrl: "/v1/avatars/user/4?v=1",
              lastSeenAt: "2026-11-12T08:00:00.000Z",
            },
          ],
        },
      }));

      await call({ GET: get });
      expect(get).toHaveBeenCalledWith("/v1/chat/bubbles", {
        params: { query: { ids: "4,5" } },
      });
      return {
        ok: true,
        status: 200,
        data: {
          bubbles: [
            {
              userId: 4,
              conversationId: 9,
              name: "Bé Na",
              avatarUrl: "/v1/avatars/user/4?v=1",
              lastSeenAt: "2026-11-12T08:00:00.000Z",
            },
          ],
        },
      };
    });
    const result = await meta.loadTraineeBubbles([4, 5]);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toMatchObject({
        userId: 4,
        name: "Bé Na",
        avatarSrc: "/api/avatar/user/4?v=1",
        lastSeenAt: "2026-11-12T08:00:00.000Z",
      });
    }
  });

  it("asks nothing for no ids", async () => {
    expect(await meta.loadTraineeBubbles([])).toEqual({
      ok: true,
      status: 200,
      data: [],
    });
    expect(state.asked).not.toHaveBeenCalled();
  });
});

describe("parseIdList", () => {
  it("keeps plain positive ids, deduped and capped", () => {
    expect(meta.parseIdList("1,2,2,x,0,-3,4", 3)).toEqual([1, 2, 4]);
    expect(meta.parseIdList(null, 5)).toEqual([]);
  });
});

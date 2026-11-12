import { beforeEach, describe, expect, it, vi } from "vitest";

import type { FakeApi } from "@/services/api/testing";
import { apiRefusal } from "@/services/api/testing";

const state = vi.hoisted(() => ({ fake: null as FakeApi | null }));
const fake = () => state.fake as FakeApi;

vi.mock("server-only", () => ({}));
vi.mock("@/services/api/call", async () => {
  const { createFakeApi } = await import("@/services/api/testing");

  state.fake = createFakeApi();
  return { callApi: state.fake.callApi, tryApi: state.fake.tryApi };
});

const { listMembers } =
  await import("@/features/members/services/member-queries");
const { getExerciseProgress } =
  await import("@/features/members/services/progress-queries");

const trainee = (id: number, name: string, displayName = name) => ({
  id,
  name,
  displayName,
  ptAdminId: null,
  avatarUrl: null,
});

beforeEach(() => {
  fake().reset();
  // The API's list: this admin's workspace, hidden trainees already left out.
  fake().respond = ({ path }) => {
    if (path === "/v1/trainees") {
      return { trainees: [trainee(1, "An", "Bé An"), trainee(3, "Cuc")] };
    }
    throw apiRefusal(404, "TRAINEE_NOT_FOUND", "Không tìm thấy user này");
  };
});

// Workspace scope, hiding and nicknames are decided by the API:
// apps/api/test/trainees.e2e.test.ts ("GET /v1/trainees").
describe("listMembers", () => {
  it("lists the trainees by the name this admin sees", async () => {
    expect(await listMembers(1)).toEqual([
      { id: 1, name: "Bé An" },
      { id: 3, name: "Cuc" },
    ]);
  });

  it("keeps the trainee whose page is open, in name order, even if hidden", async () => {
    fake().respond = ({ path }) =>
      path === "/v1/trainees"
        ? { trainees: [trainee(1, "An"), trainee(3, "Cuc")] }
        : trainee(2, "Binh", "Bé Bình");

    expect(await listMembers(1, 2)).toEqual([
      { id: 1, name: "An" },
      { id: 2, name: "Bé Bình" },
      { id: 3, name: "Cuc" },
    ]);
  });

  it("ignores keepUserId when the API says the admin may not see them", async () => {
    expect((await listMembers(1, 9)).map((m) => m.id)).toEqual([1, 3]);
  });

  it("does not ask twice for a trainee already listed", async () => {
    await listMembers(1, 1);

    expect(fake().calls.map((call) => call.path)).toEqual(["/v1/trainees"]);
  });
});

describe("getExerciseProgress", () => {
  it("returns the rows the API computed for the selected week", async () => {
    const rows = [
      {
        youtubeId: "abc",
        title: "Squat",
        weekBest: { weightKg: 60, reps: 5 },
        previousBest: null,
        changeKg: null,
        trend: "first",
        lastDate: "2026-11-03",
      },
    ];

    fake().respond = () => ({ weekStart: "2026-11-02", rows });

    expect(await getExerciseProgress(7, "2026-11-02")).toEqual(rows);
    expect(fake().calls).toMatchObject([
      {
        path: "/v1/trainees/{userId}/progress",
        init: {
          params: { path: { userId: "7" }, query: { week: "2026-11-02" } },
        },
      },
    ]);
  });
});

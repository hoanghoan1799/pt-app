import { beforeEach, describe, expect, it, vi } from "vitest";

import type { FakeApi } from "@/services/api/testing";

const state = vi.hoisted(() => ({ fake: null as FakeApi | null }));
const fake = () => state.fake as FakeApi;

vi.mock("server-only", () => ({}));
vi.mock("@/services/api/call", async () => {
  const { createFakeApi } = await import("@/services/api/testing");

  state.fake = createFakeApi();
  return { callApi: state.fake.callApi, tryApi: state.fake.tryApi };
});

const { listAdminAccounts, listPtOptions, listWorkspaceTrainees } =
  await import("@/features/pts/services/pt-queries");

const ACCOUNTS = [
  {
    id: 1,
    username: "root",
    role: "super_admin",
    verified: true,
    traineeCount: 0,
  },
  { id: 3, username: "zed", role: "pt", verified: false, traineeCount: 0 },
  { id: 2, username: "an", role: "pt", verified: false, traineeCount: 2 },
];

beforeEach(() => {
  fake().reset();
  fake().respond = ({ path }) =>
    path === "/v1/pts"
      ? { accounts: ACCOUNTS }
      : {
          trainees: [
            { id: 10, name: "U1", displayName: "Bé 1", ptAdminId: 2 },
            { id: 11, name: "U3", displayName: "U3", ptAdminId: null },
          ],
        };
});

// The trainee counts per PT are the API's: apps/api/test/admins.e2e.test.ts.
describe("PT queries", () => {
  it("lists every admin account with its trainee count and tick", async () => {
    expect(await listAdminAccounts()).toEqual(ACCOUNTS);
    expect(fake().calls).toMatchObject([
      { actor: "admin", method: "GET", path: "/v1/pts" },
    ]);
  });

  it("lists every trainee with the real name and their PT", async () => {
    expect(await listWorkspaceTrainees()).toEqual([
      { id: 10, name: "U1", ptAdminId: 2 },
      { id: 11, name: "U3", ptAdminId: null },
    ]);
  });

  it("offers only PT accounts, by username", async () => {
    expect(await listPtOptions()).toEqual([
      { id: 2, username: "an" },
      { id: 3, username: "zed" },
    ]);
  });
});

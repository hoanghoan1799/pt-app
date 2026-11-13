import { describe, expect, it } from "vitest";

import {
  toAdminAccount,
  toAdminProfile,
  toTraineeDetail,
  toTraineeSummary,
  toUserProfile,
} from "./trainee.mapper.js";

const at = new Date("2026-11-12T10:00:00.000Z");
// Rows as they come from the database, secrets included, to prove they stay out.
const userRow = {
  id: 7,
  name: "Lan",
  nameKey: "lan",
  email: "lan@example.com",
  emailKey: "lan@example.com",
  passwordHash: "scrypt$16384$salt$hash",
  avatar: "data:image/png;base64,AAAA",
  avatarUpdatedAt: new Date(1_700_000_000_000),
  ptAdminId: 3,
  chatEnabled: false,
  createdAt: at,
  locale: "vi",
  bio: null,
  chatColor: null,
};

describe("toTraineeSummary / toTraineeDetail", () => {
  it("shows exactly the public fields and the nickname as display name", () => {
    expect(toTraineeSummary(userRow, "Champ")).toEqual({
      id: 7,
      name: "Lan",
      displayName: "Champ",
      ptAdminId: 3,
      avatarUrl: "/v1/avatars/user/7?v=1700000000",
    });
    expect(toTraineeSummary(userRow).displayName).toBe("Lan");
    expect(toTraineeSummary(userRow, "  ").displayName).toBe("Lan");
  });

  it("adds login, chat and hidden flags without any hash", () => {
    const detail = toTraineeDetail(userRow, { hidden: true });

    expect(detail).toMatchObject({
      email: "lan@example.com",
      hasLogin: true,
      chatEnabled: false,
      hidden: true,
      createdAt: "2026-11-12T10:00:00.000Z",
    });
    expect(JSON.stringify(detail)).not.toMatch(
      /scrypt|passwordHash|emailKey|AAAA/,
    );
    expect(
      toTraineeDetail({ ...userRow, emailKey: null }, { hidden: false })
        .hasLogin,
    ).toBe(false);
  });
});

describe("toUserProfile / toAdminProfile / toAdminAccount", () => {
  it("never carries a hash or the stored photo", () => {
    const profile = toUserProfile({ ...userRow, chatEnabled: true });

    expect(profile.chatEnabled).toBe(true);
    expect(JSON.stringify(profile)).not.toMatch(/scrypt|AAAA|nameKey/);

    const adminRow = {
      id: 2,
      username: "coach",
      role: "super_admin" as const,
      verifiedAt: at,
      locale: "en",
      bio: "hi",
      chatColor: "teal",
      presenceHidden: false,
      avatarUpdatedAt: null,
      passwordHash: "scrypt$x",
      passcodeHash: "scrypt$y",
    };
    const admin = toAdminProfile(adminRow);

    expect(admin).toEqual({
      id: 2,
      username: "coach",
      role: "super_admin",
      verified: true,
      locale: "en",
      bio: "hi",
      chatColor: "teal",
      presenceHidden: false,
      avatarUrl: null,
    });
    expect(JSON.stringify(admin)).not.toMatch(/scrypt|passcode/);
    expect(toAdminAccount(adminRow, 4)).toEqual({
      id: 2,
      username: "coach",
      role: "super_admin",
      verified: true,
      traineeCount: 4,
    });
  });
});

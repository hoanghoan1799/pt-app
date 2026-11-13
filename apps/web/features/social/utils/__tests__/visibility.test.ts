import { describe, expect, it } from "vitest";

import type { SocialActor } from "@/features/social/types/social";
import { canSeePost } from "@/features/social/utils/visibility";

const superAdmin: SocialActor = { kind: "admin", id: 1, role: "super_admin" };
const pt: SocialActor = { kind: "admin", id: 2, role: "pt" };
const otherPt: SocialActor = { kind: "admin", id: 3, role: "pt" };
const trainee: SocialActor = { kind: "user", id: 10 };
const stranger: SocialActor = { kind: "user", id: 11 };

const traineePost = (privacy: "everyone" | "friends" | "only_me") => ({
  kind: "user" as const,
  id: 10,
  privacy,
});
const adminPost = (
  id: number,
  privacy: "everyone" | "friends" | "only_me",
) => ({ kind: "admin" as const, id, privacy });

describe("canSeePost", () => {
  it("lets a super admin see everything, even blocked or only_me", () => {
    expect(
      canSeePost(superAdmin, traineePost("only_me"), { isBlocked: true }),
    ).toBe(true);
    expect(canSeePost(superAdmin, adminPost(2, "only_me"))).toBe(true);
  });

  it("lets the author see their own post in any privacy", () => {
    for (const privacy of ["everyone", "friends", "only_me"] as const) {
      expect(canSeePost(trainee, traineePost(privacy))).toBe(true);
    }
    expect(canSeePost(pt, adminPost(2, "only_me"))).toBe(true);
  });

  it("does not mix up a user and an admin with the same id", () => {
    expect(canSeePost({ kind: "user", id: 2 }, adminPost(2, "only_me"))).toBe(
      false,
    );
  });

  it("hides everything from a blocked pair, except from a super admin and the author", () => {
    expect(
      canSeePost(stranger, traineePost("everyone"), { isBlocked: true }),
    ).toBe(false);
    expect(
      canSeePost(stranger, traineePost("friends"), {
        isBlocked: true,
        areFriends: true,
      }),
    ).toBe(false);
    expect(
      canSeePost(pt, traineePost("everyone"), {
        isBlocked: true,
        authorPtAdminId: 99,
      }),
    ).toBe(false);
  });

  it("shows only_me to nobody else", () => {
    expect(
      canSeePost(stranger, traineePost("only_me"), { areFriends: true }),
    ).toBe(false);
    expect(
      canSeePost(otherPt, traineePost("only_me"), { authorPtAdminId: 2 }),
    ).toBe(false);
  });

  it("shows everyone posts to any signed-in account", () => {
    expect(canSeePost(stranger, traineePost("everyone"))).toBe(true);
    expect(
      canSeePost(otherPt, traineePost("everyone"), { authorPtAdminId: 2 }),
    ).toBe(true);
  });

  it("shows friends posts to friends only", () => {
    expect(canSeePost(stranger, traineePost("friends"))).toBe(false);
    expect(
      canSeePost(stranger, traineePost("friends"), { areFriends: true }),
    ).toBe(true);
  });

  it("gives a PT access to every post of their own trainees", () => {
    for (const privacy of ["everyone", "friends", "only_me"] as const) {
      expect(canSeePost(pt, traineePost(privacy), { authorPtAdminId: 2 })).toBe(
        true,
      );
    }
  });

  it("keeps a PT out of friends posts of trainees from another workspace", () => {
    expect(canSeePost(pt, traineePost("friends"), { authorPtAdminId: 3 })).toBe(
      false,
    );
    expect(
      canSeePost(pt, traineePost("friends"), { authorPtAdminId: null }),
    ).toBe(false);
  });

  it("shows a super admin's friends post to every trainee", () => {
    const ctx = { authorRole: "super_admin" as const, viewerPtAdminId: null };

    expect(canSeePost(trainee, adminPost(1, "friends"), ctx)).toBe(true);
    expect(canSeePost(trainee, adminPost(1, "only_me"), ctx)).toBe(false);
  });

  it("shows a PT's friends post to their own trainees only", () => {
    const own = { authorRole: "pt" as const, viewerPtAdminId: 2 };
    const other = { authorRole: "pt" as const, viewerPtAdminId: 3 };
    const none = { authorRole: "pt" as const, viewerPtAdminId: null };

    expect(canSeePost(trainee, adminPost(2, "friends"), own)).toBe(true);
    expect(canSeePost(trainee, adminPost(2, "friends"), other)).toBe(false);
    expect(canSeePost(trainee, adminPost(2, "friends"), none)).toBe(false);
    // everyone still reaches every trainee
    expect(canSeePost(trainee, adminPost(2, "everyone"), other)).toBe(true);
  });

  it("lets staff see each other's non-private admin posts", () => {
    expect(canSeePost(pt, adminPost(3, "friends"), { authorRole: "pt" })).toBe(
      true,
    );
    expect(canSeePost(pt, adminPost(3, "only_me"), { authorRole: "pt" })).toBe(
      false,
    );
  });
});

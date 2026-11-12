import type { SocialPostPrivacy } from "@pt/contracts";
import { describe, expect, it } from "vitest";

import type { AuthorRef, SocialActor } from "../social-actor.js";
import { PostPolicy, type VisibilityContext } from "./post.policy.js";

// Ported from apps/web/features/social/utils/__tests__/visibility.test.ts, plus
// the full privacy x friendship x block matrix.

const policy = new PostPolicy();

const superAdmin: SocialActor = {
  kind: "admin",
  id: 1,
  role: "super_admin",
  revealed: false,
};
const pt: SocialActor = { kind: "admin", id: 2, role: "pt", revealed: false };
const otherPt: SocialActor = { kind: "admin", id: 3, role: "pt", revealed: false };
const trainee: SocialActor = { kind: "user", id: 10 };

const PRIVACIES: SocialPostPrivacy[] = ["everyone", "friends", "only_me"];

const view = (
  viewer: SocialActor,
  author: AuthorRef,
  privacy: SocialPostPrivacy,
  ctx: VisibilityContext = {},
) => policy.canView(viewer, { ...author, privacy }, ctx);

describe("canView", () => {
  it("lets a super admin see everything, even blocked or only_me", () => {
    for (const privacy of PRIVACIES) {
      expect(view(superAdmin, { kind: "user", id: 10 }, privacy, { isBlocked: true })).toBe(true);
    }
  });

  it("lets the author see their own post in any privacy, even with a block", () => {
    for (const privacy of PRIVACIES) {
      expect(view(trainee, { kind: "user", id: 10 }, privacy, { isBlocked: true })).toBe(true);
      expect(view(pt, { kind: "admin", id: 2 }, privacy)).toBe(true);
    }
  });

  it("does not mix up a user and an admin with the same id", () => {
    expect(view(trainee, { kind: "admin", id: 10 }, "only_me", { authorRole: "pt" })).toBe(false);
    expect(view(pt, { kind: "user", id: 2 }, "only_me", { authorPtAdminId: 9 })).toBe(false);
  });

  it("shows only_me to nobody else, except the PT of the author's workspace", () => {
    const author: AuthorRef = { kind: "user", id: 20 };

    expect(view(trainee, author, "only_me", { areFriends: true })).toBe(false);
    expect(view(otherPt, author, "only_me", { authorPtAdminId: 2 })).toBe(false);
    expect(view(pt, author, "only_me", { authorPtAdminId: 2 })).toBe(true);
    expect(view(pt, { kind: "admin", id: 99 }, "only_me", { authorRole: "pt" })).toBe(false);
  });

  it("shows everyone posts to any signed-in account that is not blocked", () => {
    expect(view(trainee, { kind: "user", id: 20 }, "everyone")).toBe(true);
    expect(view(otherPt, { kind: "user", id: 20 }, "everyone", { authorPtAdminId: 2 })).toBe(true);
    expect(view(trainee, { kind: "user", id: 20 }, "everyone", { isBlocked: true })).toBe(false);
  });

  it("shows friends posts to friends only", () => {
    const author: AuthorRef = { kind: "user", id: 20 };

    expect(view(trainee, author, "friends")).toBe(false);
    expect(view(trainee, author, "friends", { areFriends: true })).toBe(true);
    expect(view(trainee, author, "friends", { areFriends: true, isBlocked: true })).toBe(false);
  });

  it("keeps a PT out of friends posts of trainees from another workspace", () => {
    expect(view(pt, { kind: "user", id: 20 }, "friends", { authorPtAdminId: 3 })).toBe(false);
    expect(view(pt, { kind: "user", id: 20 }, "friends", { authorPtAdminId: null })).toBe(false);
    expect(view(pt, { kind: "user", id: 20 }, "friends", { authorPtAdminId: 2 })).toBe(true);
  });

  it("shows a super admin's friends post to every trainee, a PT's to their own trainees only", () => {
    const superPost: AuthorRef = { kind: "admin", id: 1 };
    const ptPost: AuthorRef = { kind: "admin", id: 2 };

    expect(view(trainee, superPost, "friends", { authorRole: "super_admin" })).toBe(true);
    expect(view(trainee, ptPost, "friends", { authorRole: "pt", viewerPtAdminId: 2 })).toBe(true);
    expect(view(trainee, ptPost, "friends", { authorRole: "pt", viewerPtAdminId: 3 })).toBe(false);
    expect(view(trainee, ptPost, "friends", { authorRole: "pt", viewerPtAdminId: null })).toBe(false);
  });

  it("lets staff see each other's non-private admin posts", () => {
    expect(view(pt, { kind: "admin", id: 3 }, "friends", { authorRole: "pt" })).toBe(true);
    expect(view(pt, { kind: "admin", id: 1 }, "everyone", { authorRole: "super_admin" })).toBe(true);
    expect(view(pt, { kind: "admin", id: 3 }, "only_me", { authorRole: "pt" })).toBe(false);
  });
});

describe("the full matrix", () => {
  // Every viewer x author x privacy x (friends, blocked) combination, checked
  // against rules written independently as a plain truth table.

  const viewers: { name: string; actor: SocialActor; ptAdminId?: number | null }[] = [
    { name: "super admin", actor: superAdmin },
    { name: "PT 2", actor: pt },
    { name: "PT 3", actor: otherPt },
    { name: "trainee of PT 2", actor: trainee, ptAdminId: 2 },
    { name: "trainee of PT 3", actor: trainee, ptAdminId: 3 },
    { name: "unassigned trainee", actor: trainee, ptAdminId: null },
  ];
  const authors: { name: string; ref: AuthorRef; ptAdminId?: number | null; role?: "super_admin" | "pt" }[] = [
    { name: "trainee of PT 2", ref: { kind: "user", id: 20 }, ptAdminId: 2 },
    { name: "trainee of PT 3", ref: { kind: "user", id: 21 }, ptAdminId: 3 },
    { name: "super admin", ref: { kind: "admin", id: 1 }, role: "super_admin" },
    { name: "PT 2", ref: { kind: "admin", id: 2 }, role: "pt" },
    { name: "PT 3", ref: { kind: "admin", id: 3 }, role: "pt" },
  ];

  const expected = (
    viewer: (typeof viewers)[number],
    author: (typeof authors)[number],
    privacy: SocialPostPrivacy,
    areFriends: boolean,
    isBlocked: boolean,
  ): boolean => {
    const v = viewer.actor;
    const isSelf = v.kind === author.ref.kind && v.id === author.ref.id;

    if ((v.kind === "admin" && v.role === "super_admin") || isSelf) {
      return true;
    }
    if (isBlocked) {
      return false;
    }
    if (v.kind === "admin" && v.role === "pt" && author.ref.kind === "user" && author.ptAdminId === v.id) {
      return true;
    }
    if (privacy === "only_me") {
      return false;
    }
    if (privacy === "everyone") {
      return true;
    }
    // friends
    if (areFriends) {
      return true;
    }
    if (v.kind === "admin") {
      return author.ref.kind === "admin" || (v.role === "pt" && author.ptAdminId === v.id);
    }
    return (
      author.ref.kind === "admin" &&
      (author.role === "super_admin" || (author.role === "pt" && viewer.ptAdminId === author.ref.id))
    );
  };

  it("agrees with the truth table in every combination", () => {
    let checked = 0;

    for (const viewer of viewers) {
      for (const author of authors) {
        for (const privacy of PRIVACIES) {
          for (const areFriends of [false, true]) {
            for (const isBlocked of [false, true]) {
              const ctx: VisibilityContext = {
                areFriends,
                isBlocked,
                authorPtAdminId: author.ptAdminId,
                authorRole: author.role,
                viewerPtAdminId: viewer.ptAdminId,
              };
              const name = `${viewer.name} -> ${author.name} ${privacy} friends=${areFriends} blocked=${isBlocked}`;

              expect(
                policy.canView(viewer.actor, { ...author.ref, privacy }, ctx),
                name,
              ).toBe(expected(viewer, author, privacy, areFriends, isBlocked));
              checked += 1;
            }
          }
        }
      }
    }
    expect(checked).toBe(6 * 5 * 3 * 2 * 2);
  });

  it("visiblePrivacies lists exactly the privacies canView allows", () => {
    for (const viewer of viewers) {
      for (const author of authors) {
        const ctx: VisibilityContext = {
          areFriends: false,
          authorPtAdminId: author.ptAdminId,
          authorRole: author.role,
          viewerPtAdminId: viewer.ptAdminId,
        };

        expect(policy.visiblePrivacies(viewer.actor, author.ref, ctx)).toEqual(
          PRIVACIES.filter((privacy) =>
            policy.canView(viewer.actor, { ...author.ref, privacy }, ctx),
          ),
        );
      }
    }
    expect(policy.visiblePrivacies(trainee, { kind: "user", id: 20 }, { isBlocked: true })).toEqual([]);
    expect(policy.visiblePrivacies(trainee, { kind: "user", id: 20 }, { areFriends: true })).toEqual([
      "everyone",
      "friends",
    ]);
  });
});

describe("edit and delete rights", () => {
  it("lets only the author edit, and the author or a super admin delete", () => {
    const author: AuthorRef = { kind: "user", id: 10 };

    expect(policy.canEdit(trainee, author)).toBe(true);
    expect(policy.canEdit(superAdmin, author)).toBe(false);
    expect(policy.canEdit(pt, author)).toBe(false);
    expect(policy.canEdit({ kind: "user", id: 11 }, author)).toBe(false);
    expect(policy.canDelete(trainee, author)).toBe(true);
    expect(policy.canDelete(superAdmin, author)).toBe(true);
    expect(policy.canDelete(pt, author)).toBe(false);
    expect(policy.canDelete({ kind: "user", id: 11 }, author)).toBe(false);
    // Same id, other kind.
    expect(policy.canEdit({ kind: "admin", id: 10, role: "pt", revealed: false }, author)).toBe(false);
  });
});

import { describe, expect, it } from "vitest";

import type { AdminActor, UserActor } from "../auth/actor.js";
import {
  dmAccessOf,
  dmPairOf,
  dmPreviewText,
  otherMember,
} from "./dm.rules.js";

const session = {
  id: "00000000-0000-4000-8000-000000000000",
  clientKind: "web" as const,
  clientName: null,
  createdAt: new Date(),
  lastSeenAt: new Date(),
  expiresAt: new Date(),
};
const trainee = (id: number): UserActor => ({
  kind: "user",
  id,
  role: "trainee",
  name: "T",
  email: null,
  locale: null,
  ptAdminId: null,
  session,
});
const admin = (role: AdminActor["role"]): AdminActor => ({
  kind: "admin",
  id: 1,
  role,
  username: "a",
  verified: false,
  locale: null,
  presenceHidden: false,
  hasPasscode: false,
  unlockedUntil: null,
  revealedUntil: null,
  locked: false,
  revealed: false,
  session,
});

describe("dmAccessOf (Q6)", () => {
  const members = { low: 3, high: 8 };

  it("opens for the two members, not for a third trainee", () => {
    expect(dmAccessOf(trainee(3), members, false)).toBe("member");
    expect(dmAccessOf(trainee(8), members, false)).toBe("member");
    expect(dmAccessOf(trainee(5), members, false)).toBe("none");
  });

  it("is hidden from the members by a block", () => {
    expect(dmAccessOf(trainee(3), members, true)).toBe("none");
  });

  it("is read-only for a super admin and closed to a PT", () => {
    expect(dmAccessOf(admin("super_admin"), members, false)).toBe(
      "readonly_admin",
    );
    expect(dmAccessOf(admin("super_admin"), members, true)).toBe(
      "readonly_admin",
    );
    expect(dmAccessOf(admin("pt"), members, false)).toBe("none");
  });
});

describe("pairs and previews", () => {
  it("sorts a pair and finds the other member", () => {
    expect(dmPairOf(9, 4)).toEqual({ low: 4, high: 9 });
    expect(dmPairOf(4, 9)).toEqual({ low: 4, high: 9 });
    expect(otherMember({ low: 4, high: 9 }, 4)).toBe(9);
    expect(otherMember({ low: 4, high: 9 }, 9)).toBe(4);
  });

  it("previews text, photos and unsent messages", () => {
    expect(
      dmPreviewText({ body: "chào", photoId: null, deletedAt: null }),
    ).toBe("chào");
    expect(dmPreviewText({ body: null, photoId: 2, deletedAt: null })).toBe(
      "📷 Ảnh",
    );
    expect(dmPreviewText({ body: "xem", photoId: 2, deletedAt: null })).toBe(
      "📷 Ảnh xem",
    );
    expect(
      dmPreviewText({ body: "x", photoId: null, deletedAt: new Date() }),
    ).toBe("Tin nhắn đã được thu hồi");
    expect(dmPreviewText({ body: null, photoId: null, deletedAt: null })).toBe(
      "",
    );
  });
});

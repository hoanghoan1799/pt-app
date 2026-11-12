import { describe, expect, it } from "vitest";

import { resolveTraineePt } from "@/features/members/services/resolve-trainee-pt";
import { PT_MESSAGES } from "@/features/pts/constants/messages";

const superAdmin = { id: 1, role: "super_admin" as const };
const pt = { id: 7, role: "pt" as const };

describe("resolveTraineePt", () => {
  it("puts a PT's trainee in their own workspace and ignores a posted PT", () => {
    expect(resolveTraineePt(pt, "9")).toEqual({ status: "ok", ptAdminId: 7 });
    expect(resolveTraineePt(pt, "")).toEqual({ status: "ok", ptAdminId: 7 });
  });

  it("lets a super admin leave the trainee without a PT or pick one", () => {
    expect(resolveTraineePt(superAdmin, "")).toEqual({
      status: "ok",
      ptAdminId: null,
    });
    expect(resolveTraineePt(superAdmin, " 9 ")).toEqual({
      status: "ok",
      ptAdminId: 9,
    });
  });

  it.each(["abc", "-1", "0", "1.5"])("rejects %s", (raw) => {
    expect(resolveTraineePt(superAdmin, raw)).toEqual({
      status: "error",
      message: PT_MESSAGES.PT_NOT_FOUND,
    });
  });
});

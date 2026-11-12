import { describe, expect, it } from "vitest";

import { getFormatTranslator } from "@/i18n/format-translator";

describe("fallback display names", () => {
  it("keeps the Vietnamese wording the lists have always shown", () => {
    const vi = getFormatTranslator("vi");

    expect(vi("fallback.deletedAccount")).toBe("Đã xóa");
    expect(vi("fallback.deletedAccountDm")).toBe("Đã xoá");
    expect(vi("fallback.postImageOnly")).toBe("(Bài viết chỉ có ảnh)");
    expect(vi("thread.peerDeleted")).toBe("PT (đã xoá)");
  });

  it("translates the same fallbacks to English", () => {
    const en = getFormatTranslator("en");

    expect(en("fallback.deletedAccount")).toBe("Deleted account");
    expect(en("fallback.deletedAccountDm")).toBe("Deleted account");
    expect(en("fallback.postImageOnly")).toBe("(Photo-only post)");
    expect(en("thread.peerDeleted")).toBe("PT (deleted)");
  });
});

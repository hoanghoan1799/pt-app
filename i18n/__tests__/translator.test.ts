import { describe, expect, it } from "vitest";

import { getTranslator } from "@/i18n/translator";

describe("getTranslator", () => {
  it("translates in the requested locale", () => {
    expect(getTranslator("vi", "common")("confirm.cancel")).toBe("Hủy");
    expect(getTranslator("en", "common")("confirm.cancel")).toBe("Cancel");
  });

  it("fills ICU placeholders", () => {
    expect(
      getTranslator("en", "common")("avatarLightbox.label", { name: "An" }),
    ).toBe("Photo of An");
  });
});

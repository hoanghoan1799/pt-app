import { describe, expect, it } from "vitest";

import { describeErrorReference } from "@/utils/errors";

describe("describeErrorReference by locale", () => {
  it("is Vietnamese by default (server, tests)", () => {
    expect(describeErrorReference("3f9a1c2e")).toBe("Mã tham chiếu: 3f9a1c2e");
  });

  it("is English for the en locale", () => {
    expect(describeErrorReference("3f9a1c2e", "en")).toBe(
      "Reference code: 3f9a1c2e",
    );
  });

  it("is empty without a reference", () => {
    expect(describeErrorReference(undefined, "en")).toBeUndefined();
  });
});

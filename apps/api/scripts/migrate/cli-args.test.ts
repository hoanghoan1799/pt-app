import { describe, expect, it } from "vitest";

import { withoutPnpmSeparator } from "./cli-args.js";

describe("withoutPnpmSeparator", () => {
  it("drops a leading separator (data:migrate -- --source ...)", () => {
    expect(withoutPnpmSeparator(["--", "--source", "file:a.db"])).toEqual([
      "--source",
      "file:a.db",
    ]);
  });

  it("drops the separator after a flag the npm script already passes (data:verify -- --source ...)", () => {
    expect(
      withoutPnpmSeparator(["--verify", "--", "--source", "file:a.db"]),
    ).toEqual(["--verify", "--source", "file:a.db"]);
  });

  it("keeps the arguments as they are without a separator", () => {
    expect(withoutPnpmSeparator(["--verify", "--source", "x"])).toEqual([
      "--verify",
      "--source",
      "x",
    ]);
  });

  it("drops only the first separator", () => {
    expect(withoutPnpmSeparator(["--", "--report", "--"])).toEqual([
      "--report",
      "--",
    ]);
  });
});

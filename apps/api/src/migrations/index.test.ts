import { readdirSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { migrations } from "./index.js";

describe("migrations list", () => {
  it("contains every migration file, oldest first", () => {
    const files = readdirSync(dirname(fileURLToPath(import.meta.url)))
      .filter((file) => /^\d+-.+\.ts$/.test(file) && !file.endsWith(".test.ts"))
      .sort();
    const listed = migrations.map((migration) => migration.name);

    expect(listed).toHaveLength(files.length);
    // The file is "<timestamp>-<name>.ts", the class "<Name><timestamp>"; the
    // name may be kebab-case in the file (avatar-tables -> AvatarTables).
    const normalize = (name: string) =>
      name.replace(/[^a-z0-9]/gi, "").toLowerCase();

    expect(
      files.map((file) => normalize(file.replace(/^(\d+)-(.+)\.ts$/, "$2$1"))),
    ).toEqual(listed.map(normalize));
  });
});

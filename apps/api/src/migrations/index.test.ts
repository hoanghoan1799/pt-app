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
    // `1795100000000-db-constraints.ts` is the class DbConstraints1795100000000.
    const pascal = (slug: string) =>
      slug
        .split("-")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join("");

    expect(
      files.map((file) =>
        file.replace(
          /^(\d+)-(.+)\.ts$/,
          (_all, id: string, slug: string) => `${pascal(slug)}${id}`,
        ),
      ),
    ).toEqual(listed);
  });
});

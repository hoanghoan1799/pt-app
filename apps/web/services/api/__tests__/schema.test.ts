import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import openapiTS, { astToString } from "openapi-typescript";
import { describe, expect, it } from "vitest";

// Fails when apps/api/openapi.json changed and schema.d.ts was not regenerated.
// Fix: pnpm --filter @pt/web api:types, then commit the file.
describe("services/api/schema.d.ts", () => {
  it("matches apps/api/openapi.json", async () => {
    const openapi = resolve(__dirname, "../../../../api/openapi.json");
    const committed = readFileSync(
      resolve(__dirname, "../schema.d.ts"),
      "utf8",
    );
    const generated = astToString(await openapiTS(pathToFileURL(openapi)));

    // The CLI writes a short header comment above the generated code.
    expect(committed.endsWith(generated)).toBe(true);
  }, 30_000);
});

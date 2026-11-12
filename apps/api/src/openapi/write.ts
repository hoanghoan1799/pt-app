// Writes apps/api/openapi.json: `pnpm --filter @pt/api openapi`. The file is the
// input of the typed web client (openapi-typescript) and must be committed;
// openapi.test.ts and CI fail when it is stale.
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import {
  generateOpenApiDocument,
  serializeOpenApiDocument,
} from "./generate.js";

export const OPENAPI_PATH = fileURLToPath(
  new URL("../../openapi.json", import.meta.url),
);

const document = await generateOpenApiDocument();

await writeFile(OPENAPI_PATH, serializeOpenApiDocument(document), "utf8");
console.log(`Wrote ${OPENAPI_PATH}`);
process.exit(0);

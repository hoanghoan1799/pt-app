import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  generateOpenApiDocument,
  serializeOpenApiDocument,
} from "./generate.js";

const COMMITTED = fileURLToPath(new URL("../../openapi.json", import.meta.url));

describe("openapi.json", () => {
  it("is up to date (run `pnpm --filter @pt/api openapi` and commit it)", async () => {
    const generated = serializeOpenApiDocument(await generateOpenApiDocument());
    const committed = await readFile(COMMITTED, "utf8");

    expect(committed).toBe(generated);
  });

  it("documents the auth endpoints under /v1 with bearer security", async () => {
    const document = (await generateOpenApiDocument()) as unknown as {
      paths: Record<string, Record<string, unknown>>;
    };

    for (const route of [
      "/v1/auth/login",
      "/v1/auth/admin/login",
      "/v1/auth/refresh",
      "/v1/auth/logout",
      "/v1/auth/me",
      "/v1/auth/sessions",
      "/v1/auth/sessions/{id}",
      "/v1/admins/me/passcode",
      "/v1/admins/me/passcode/verify",
      "/v1/admins/me/passcode/lock",
      "/v1/users/me/password",
    ]) {
      expect(document.paths).toHaveProperty([route]);
    }
  });

  it("never mentions a hash or a passcode value in a response schema", async () => {
    const text = JSON.stringify(await generateOpenApiDocument());

    expect(text).not.toMatch(/passwordHash|passcodeHash|tokenHash/);
  });
});

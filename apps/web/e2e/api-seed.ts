import { createClient } from "@libsql/client";

import {
  E2E_ADMIN,
  E2E_API_URL,
  E2E_DB_URL,
  E2E_USER_PASSWORD,
} from "./config";

// Seeds the API (PostgreSQL) with the same people the legacy SQLite seed
// created, through the API's own endpoints, in the same id order so a trainee
// has the same id on both sides while feature areas still read SQLite:
//
//   admin login -> POST /v1/trainees (API generates a password)
//   -> trainee login -> POST /v1/users/me/password (to the shared e2e password)
//
// The e2e super admin itself is created by e2e/api-server.mjs.

type Json = Record<string, unknown>;

const call = async (
  method: string,
  path: string,
  { token, body }: { token?: string; body?: Json } = {},
) => {
  const response = await fetch(`${E2E_API_URL}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    throw new Error(
      `e2e api seed: ${method} ${path} -> ${response.status} ${await response.text()}`,
    );
  }
  return response.status === 204
    ? ({} as Json)
    : ((await response.json()) as Json);
};

export const waitForApi = async () => {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      if ((await fetch(`${E2E_API_URL}/v1/health`)).ok) {
        return;
      }
    } catch {
      // not up yet
    }
    await new Promise((done) => setTimeout(done, 1000));
  }
  throw new Error("e2e api seed: the API did not answer /v1/health");
};

export const seedApiFromLegacyDatabase = async () => {
  await waitForApi();

  const legacy = createClient({ url: E2E_DB_URL });
  const rows = (
    await legacy.execute("SELECT id, name, email FROM users ORDER BY id")
  ).rows;

  legacy.close();

  const { token: adminToken } = (await call("POST", "/v1/auth/admin/login", {
    body: {
      username: E2E_ADMIN.username,
      password: E2E_ADMIN.password,
      clientKind: "web",
    },
  })) as { token: string };

  for (const row of rows) {
    const created = (await call("POST", "/v1/trainees", {
      token: adminToken,
      body: { name: String(row.name), email: String(row.email) },
    })) as { id: number; password: string };

    if (created.id !== Number(row.id)) {
      throw new Error(
        `e2e api seed: trainee "${String(row.name)}" got API id ${created.id}, legacy id ${Number(row.id)}`,
      );
    }

    const { token } = (await call("POST", "/v1/auth/login", {
      body: {
        email: String(row.email),
        password: created.password,
        clientKind: "web",
      },
    })) as { token: string };

    await call("POST", "/v1/users/me/password", {
      token,
      body: {
        currentPassword: created.password,
        newPassword: E2E_USER_PASSWORD,
      },
    });
  }
};

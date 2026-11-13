import {
  E2E_ADMIN,
  E2E_API_URL,
  E2E_SEEDED_TRAINEES,
  E2E_USER_PASSWORD,
  e2eEmail,
} from "./config";

// Seeds the API (PostgreSQL) with the e2e trainees (E2E_SEEDED_TRAINEES, in that
// order) through the API's own endpoints:
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

export const seedApiTrainees = async () => {
  await waitForApi();

  const { token: adminToken } = (await call("POST", "/v1/auth/admin/login", {
    body: {
      username: E2E_ADMIN.username,
      password: E2E_ADMIN.password,
      clientKind: "web",
    },
  })) as { token: string };

  // One after the other: the API hands out ids in call order.
  for (const name of E2E_SEEDED_TRAINEES) {
    const email = e2eEmail(name);
    const created = (await call("POST", "/v1/trainees", {
      token: adminToken,
      body: { name, email },
    })) as { id: number; password: string };
    const { token } = (await call("POST", "/v1/auth/login", {
      body: { email, password: created.password, clientKind: "web" },
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

import { E2E_ADMIN, E2E_API_URL, E2E_USER_PASSWORD, e2eEmail } from "./config";

// Data of the users / members / PTs / avatars area, created and reset through
// the API's own endpoints (never by writing the API's PostgreSQL directly). The
// global setup (api-seed.ts) already created the seeded trainees.

type Json = Record<string, unknown>;

const call = async <Result = Json>(
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
      `e2e api: ${method} ${path} -> ${response.status} ${await response.text()}`,
    );
  }
  return (response.status === 204 ? {} : await response.json()) as Result;
};

export const loginAdminViaApi = async (
  username: string = E2E_ADMIN.username,
  password: string = E2E_ADMIN.password,
) =>
  (
    await call<{ token: string }>("POST", "/v1/auth/admin/login", {
      body: { username, password, clientKind: "web" },
    })
  ).token;

// A seeded trainee, by display name, with the shared e2e password.
export const loginTraineeViaApi = async (name: string) =>
  (
    await call<{ token: string }>("POST", "/v1/auth/login", {
      body: {
        email: e2eEmail(name),
        password: E2E_USER_PASSWORD,
        clientKind: "web",
      },
    })
  ).token;

// A trainee with a known password, created as the e2e admin would: the API
// generates the password, then the trainee moves it to the shared e2e one.
export const createTraineeViaApi = async (
  name: string,
  { ptAdminId }: { ptAdminId?: number | null } = {},
) => {
  const adminToken = await loginAdminViaApi();
  const created = await call<{ id: number; password: string }>(
    "POST",
    "/v1/trainees",
    { token: adminToken, body: { name, email: e2eEmail(name), ptAdminId } },
  );
  const { token } = await call<{ token: string }>("POST", "/v1/auth/login", {
    body: {
      email: e2eEmail(name),
      password: created.password,
      clientKind: "web",
    },
  });

  await call("POST", "/v1/users/me/password", {
    token,
    body: {
      currentPassword: created.password,
      newPassword: E2E_USER_PASSWORD,
    },
  });
  return created.id;
};

// Back to "no photo" for one trainee and for the e2e admin (the avatar specs
// upload photos for both).
export const clearAvatarsViaApi = async (traineeName: string) => {
  await call("DELETE", "/v1/users/me/avatar", {
    token: await loginTraineeViaApi(traineeName),
  });
  await call("DELETE", "/v1/admins/me/avatar", {
    token: await loginAdminViaApi(),
  });
};

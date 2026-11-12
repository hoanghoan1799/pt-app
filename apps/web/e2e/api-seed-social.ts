import { E2E_ADMIN, E2E_API_URL, E2E_USER_PASSWORD, e2eEmail } from "./config";

// Data for the social specs, created through the API's own endpoints (the web
// no longer has a social database). Each spec file calls these in its
// beforeAll; nothing here runs in global-setup.

type Json = Record<string, unknown>;

export interface SocialPerson {
  id: number;
  name: string;
  email: string;
  token: string;
}

const call = async <Result = Json>(
  method: string,
  path: string,
  {
    token,
    body,
    headers,
  }: { token?: string; body?: unknown; headers?: Json } = {},
) => {
  const response = await fetch(`${E2E_API_URL}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(headers as Record<string, string> | undefined),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(
      `e2e social seed: ${method} ${path} -> ${response.status} ${await response.text()}`,
    );
  }
  return (response.status === 204 ? {} : await response.json()) as Result;
};

export const loginAsAdminApi = async () =>
  (
    await call<{ token: string }>("POST", "/v1/auth/admin/login", {
      body: {
        username: E2E_ADMIN.username,
        password: E2E_ADMIN.password,
        clientKind: "web",
      },
    })
  ).token;

// A trainee with the shared e2e password, ready to log in through the UI.
export const createSocialTrainee = async (
  adminToken: string,
  name: string,
): Promise<SocialPerson> => {
  const email = e2eEmail(name);
  const created = await call<{ id: number; password: string }>(
    "POST",
    "/v1/trainees",
    { token: adminToken, body: { name, email } },
  );
  const { token } = await call<{ token: string }>("POST", "/v1/auth/login", {
    body: { email, password: created.password, clientKind: "web" },
  });

  await call("POST", "/v1/users/me/password", {
    token,
    body: { currentPassword: created.password, newPassword: E2E_USER_PASSWORD },
  });
  return { id: created.id, name, email, token };
};

export const acceptTermsApi = (token: string) =>
  call("POST", "/v1/social/me/terms", { token });

export const makeFriendsApi = async (a: SocialPerson, b: SocialPerson) => {
  await call("POST", "/v1/social/friends/requests", {
    token: a.token,
    body: { userId: b.id },
  });
  await call("POST", `/v1/social/friends/requests/${a.id}/accept`, {
    token: b.token,
  });
};

let keyCounter = 0;

export const createPostApi = async (
  token: string,
  caption: string,
  privacy: "everyone" | "friends" | "only_me" = "friends",
) =>
  (
    await call<{ post: { id: number } }>("POST", "/v1/social/posts", {
      token,
      body: { caption, privacy },
      headers: {
        "Idempotency-Key": `e2e-${Date.now()}-${keyCounter++}`,
      },
    })
  ).post.id;

export const reactApi = (token: string, postId: number, emoji: string) =>
  call("PUT", `/v1/social/posts/${postId}/reaction`, {
    token,
    body: { emoji },
  });

export const commentApi = (token: string, postId: number, body: string) =>
  call("POST", `/v1/social/posts/${postId}/comments`, {
    token,
    body: { body },
  });

export const reportApi = (
  token: string,
  targetKind: "post" | "comment" | "user",
  targetId: number,
  reason = "",
) =>
  call("POST", "/v1/social/reports", {
    token,
    body: { targetKind, targetId, ...(reason ? { reason } : {}) },
  });

// Which devices may receive a push, and the limits of a subscription.

export const PUSH_KINDS = ["web", "expo", "fcm"] as const;
export type PushKind = (typeof PUSH_KINDS)[number];

export const PUSH_MAX_ENDPOINT_LENGTH = 2048;
export const PUSH_MAX_KEY_LENGTH = 512;

// The server POSTs to the endpoint on every notification, so only the
// browsers' push services are accepted (no SSRF to internal or arbitrary
// hosts). Exact host or a subdomain of it, default https port only.
export const PUSH_SERVICE_HOSTS = [
  "fcm.googleapis.com",
  "android.googleapis.com",
  "push.apple.com",
  "notify.windows.com",
  "push.services.mozilla.com",
] as const;

export const isAllowedPushEndpoint = (value: string) => {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.port !== "" || url.username) {
    return false;
  }
  const host = url.hostname.toLowerCase();

  return PUSH_SERVICE_HOSTS.some(
    (allowed) => host === allowed || host.endsWith(`.${allowed}`),
  );
};

export const PUSH_MESSAGES = {
  INVALID_SUBSCRIPTION: "Đăng ký thông báo không hợp lệ",
} as const;

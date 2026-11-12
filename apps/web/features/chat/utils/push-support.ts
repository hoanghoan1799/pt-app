export type PushOptInState = "hidden" | "show" | "ios-install-hint" | "denied";

export interface PushOptInInput {
  // PushManager, Notification and a service worker are all available.
  supported: boolean;
  permission: NotificationPermission | "unsupported";
  // Running as the installed app (home screen), not in a browser tab.
  standalone: boolean;
  isIos: boolean;
  dismissed: boolean;
  // This browser already holds a push subscription.
  subscribed: boolean;
  hasVapidKey: boolean;
}

// Which variant of the one-time opt-in card to show. iOS only supports push in
// the installed app, so a Safari tab gets the install steps first.
export const getPushOptInState = ({
  supported,
  permission,
  standalone,
  isIos,
  dismissed,
  subscribed,
  hasVapidKey,
}: PushOptInInput): PushOptInState => {
  if (!hasVapidKey || dismissed || subscribed) {
    return "hidden";
  }
  if (isIos && !standalone) {
    return "ios-install-hint";
  }
  if (!supported) {
    return "hidden";
  }
  if (permission === "denied") {
    return "denied";
  }
  return "show";
};

// The browser wants the VAPID public key as bytes; the env var is base64url.
export const urlBase64ToUint8Array = (base64: string) => {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding)
    .replaceAll("-", "+")
    .replaceAll("_", "/");
  const raw = atob(normalized);
  const bytes = new Uint8Array(raw.length);

  for (let index = 0; index < raw.length; index += 1) {
    bytes[index] = raw.charCodeAt(index);
  }
  return bytes;
};

// "Để sau" hides the install banner for this many days.
export const DISMISS_DAYS = 14;

export const DISMISS_STORAGE_KEY = "pt-app:install-dismissed-at";

// Fired on window by the capture script when the saved install event changes.
export const INSTALL_PROMPT_EVENT = "pt:installprompt";

// Dev keeps hot reload free of a worker unless NEXT_PUBLIC_ENABLE_SW=1 (e2e).
export const IS_PWA_ENABLED =
  process.env.NODE_ENV === "production" ||
  process.env.NEXT_PUBLIC_ENABLE_SW === "1";

export const BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID ?? "dev";

export const NEW_VERSION_TOAST_ID = "new-version";

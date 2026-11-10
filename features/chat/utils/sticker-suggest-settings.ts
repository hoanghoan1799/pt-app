// Per-device switches for typing suggestions, kept in localStorage only. Both
// are on unless the stored text is exactly "0".
export const SUGGEST_SETTING_KEYS = {
  stickers: "pt-app:sticker-suggest",
  gifs: "pt-app:sticker-suggest-gif",
} as const;

export type SuggestSetting = keyof typeof SUGGEST_SETTING_KEYS;

export const SUGGEST_SETTINGS_EVENT = "pt-app:sticker-suggest-change";

export const parseSuggestSetting = (raw: string | null): boolean => raw !== "0";

export const loadSuggestSetting = (setting: SuggestSetting): boolean => {
  try {
    return parseSuggestSetting(
      window.localStorage.getItem(SUGGEST_SETTING_KEYS[setting]),
    );
  } catch {
    return true;
  }
};

export const saveSuggestSetting = (
  setting: SuggestSetting,
  enabled: boolean,
) => {
  try {
    if (enabled) {
      window.localStorage.removeItem(SUGGEST_SETTING_KEYS[setting]);
    } else {
      window.localStorage.setItem(SUGGEST_SETTING_KEYS[setting], "0");
    }
  } catch {
    // Storage blocked or full: the switch just does not stick.
  }
  try {
    window.dispatchEvent(new Event(SUGGEST_SETTINGS_EVENT));
  } catch {
    // No window to notify.
  }
};

// For useSyncExternalStore: fires on a write in this tab (custom event) and in
// another tab (storage event).
export const subscribeSuggestSettings = (onChange: () => void) => {
  const keys: string[] = Object.values(SUGGEST_SETTING_KEYS);
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || keys.includes(event.key)) {
      onChange();
    }
  };

  window.addEventListener("storage", onStorage);
  window.addEventListener(SUGGEST_SETTINGS_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(SUGGEST_SETTINGS_EVENT, onChange);
  };
};

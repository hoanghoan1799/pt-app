// Admin-only "neutral chat colours" switch: when on, the admin sees every
// bubble in the default colours on this device. Kept in localStorage only;
// trainees and the server never know about it.
export const NEUTRAL_COLORS_KEY = "pt-app:admin-neutral-colors";
export const NEUTRAL_COLORS_EVENT = "pt-app:neutral-colors-change";

// Only the exact text "1" means on.
export const parseNeutralColors = (raw: string | null): boolean => raw === "1";

export const loadNeutralColors = (): boolean => {
  try {
    return parseNeutralColors(window.localStorage.getItem(NEUTRAL_COLORS_KEY));
  } catch {
    return false;
  }
};

export const saveNeutralColors = (enabled: boolean) => {
  try {
    if (enabled) {
      window.localStorage.setItem(NEUTRAL_COLORS_KEY, "1");
    } else {
      window.localStorage.removeItem(NEUTRAL_COLORS_KEY);
    }
  } catch {
    // Storage blocked or full: the switch just does not stick.
  }
  try {
    window.dispatchEvent(new Event(NEUTRAL_COLORS_EVENT));
  } catch {
    // No window to notify.
  }
};

// For useSyncExternalStore: fires on a write in this tab (custom event) and in
// another tab (storage event), so every mounted component updates at once.
export const subscribeNeutralColors = (onChange: () => void) => {
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === NEUTRAL_COLORS_KEY) {
      onChange();
    }
  };

  window.addEventListener("storage", onStorage);
  window.addEventListener(NEUTRAL_COLORS_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(NEUTRAL_COLORS_EVENT, onChange);
  };
};

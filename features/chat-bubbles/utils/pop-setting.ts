import {
  POP_SETTING_EVENT,
  POP_SETTING_KEY,
} from "@/features/chat-bubbles/constants";

// Per-device switch "show a chat bubble on new messages"; on unless "0".
export const parsePopSetting = (raw: string | null) => raw !== "0";

export const loadPopSetting = () => {
  try {
    return parsePopSetting(window.localStorage.getItem(POP_SETTING_KEY));
  } catch {
    return true;
  }
};

export const savePopSetting = (enabled: boolean) => {
  try {
    if (enabled) {
      window.localStorage.removeItem(POP_SETTING_KEY);
    } else {
      window.localStorage.setItem(POP_SETTING_KEY, "0");
    }
  } catch {
    // Storage blocked: the switch just does not stick.
  }
  window.dispatchEvent(new Event(POP_SETTING_EVENT));
};

export const subscribePopSetting = (onChange: () => void) => {
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === POP_SETTING_KEY) {
      onChange();
    }
  };

  window.addEventListener("storage", onStorage);
  window.addEventListener(POP_SETTING_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(POP_SETTING_EVENT, onChange);
  };
};

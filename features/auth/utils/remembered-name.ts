import { REMEMBERED_NAME_KEY } from "@/features/auth/constants/messages";

// Storage can throw in private mode or when site data is blocked; remembering
// the name is a convenience, so failures are ignored.
export const readRememberedName = () => {
  try {
    return window.localStorage.getItem(REMEMBERED_NAME_KEY) ?? "";
  } catch {
    return "";
  }
};

export const saveRememberedName = (name: string) => {
  try {
    window.localStorage.setItem(REMEMBERED_NAME_KEY, name);
  } catch {
    // Ignored, see above.
  }
};

export const forgetRememberedName = () => {
  try {
    window.localStorage.removeItem(REMEMBERED_NAME_KEY);
  } catch {
    // Ignored, see above.
  }
};

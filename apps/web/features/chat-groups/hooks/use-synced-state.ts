"use client";

import { type Dispatch, type SetStateAction, useState } from "react";

// Local state seeded from a server value that starts over whenever that value
// changes (the page was refreshed by another manager's change): a field the
// viewer is editing follows the newest name, switch or mute. Adjusting state
// while rendering is React's documented way to reset on a prop change.
export const useSyncedState = <T>(
  source: T,
): [T, Dispatch<SetStateAction<T>>] => {
  const [value, setValue] = useState(source);
  const [seen, setSeen] = useState(source);

  if (!Object.is(seen, source)) {
    setSeen(source);
    setValue(source);
  }
  return [value, setValue];
};

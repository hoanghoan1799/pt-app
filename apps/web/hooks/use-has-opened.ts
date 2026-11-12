"use client";

import { useState } from "react";

// True from the first render in which `isOpen` is true, and stays true. Gate a
// lazily loaded sheet or viewer with it: nothing is fetched or mounted until
// the first open, and the sheet stays mounted afterwards so it can play its
// close animation.
export const useHasOpened = (isOpen: boolean) => {
  const [hasOpened, setHasOpened] = useState(isOpen);

  if (isOpen && !hasOpened) {
    setHasOpened(true);
  }

  return hasOpened || isOpen;
};

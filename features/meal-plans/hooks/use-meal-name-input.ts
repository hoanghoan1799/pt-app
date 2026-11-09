"use client";

import { useState } from "react";

// The meal name is edited in place and saved when the field loses focus.
// `savedName` is the stored value; `shownName` is what the field shows when
// untouched (the localized default). Leaving the field without changing the
// text never saves.
export const useMealNameInput = (
  savedName: string,
  shownName: string,
  save: (name: string) => void,
) => {
  // null = not edited yet, the field follows `shownName` (e.g. a language switch).
  const [draft, setDraft] = useState<string | null>(null);
  const name = draft ?? shownName;

  const handleBlur = () => {
    const trimmed = name.trim().replace(/\s+/g, " ");

    if (!trimmed || trimmed === shownName || trimmed === savedName) {
      setDraft(null);
      return;
    }
    setDraft(trimmed);
    save(trimmed);
  };

  return { name, setName: setDraft, handleBlur };
};

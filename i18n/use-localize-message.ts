"use client";

import { useLocale } from "next-intl";
import { useCallback } from "react";

import { localizeMessageFor } from "@/i18n/localize-message";
import { parseLocale } from "@/utils/locale";

// Client twin of services/localize-message.ts, for texts that are raised in the
// browser (photo encoding, local validation) and shown right there.
export const useLocalizeMessage = () => {
  const locale = parseLocale(useLocale());

  return useCallback(
    (text: string) => localizeMessageFor(locale, text),
    [locale],
  );
};

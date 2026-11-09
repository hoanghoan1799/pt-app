"use client";

import { useTranslations } from "next-intl";

export const OfflineRetryButton = () => {
  const t = useTranslations("pwa.offlineRetry");

  return (
    <button
      type="button"
      onClick={() => window.location.reload()}
      className="mt-6 inline-flex min-h-12 items-center justify-center rounded-2xl bg-accent px-6 text-sm font-semibold text-accent-fg shadow-md shadow-accent/25 active:opacity-80"
    >
      {t("retry")}
    </button>
  );
};

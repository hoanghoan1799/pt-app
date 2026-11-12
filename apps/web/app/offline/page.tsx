import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { OfflineRetryButton } from "@/features/pwa/components/OfflineRetryButton";

export const generateMetadata = async (): Promise<Metadata> => {
  const t = await getTranslations("layout.offline");

  return { title: t("title") };
};

// Precached by public/sw.js and shown only when a navigation fails because the
// network is down. Public: it holds no user data (the language comes from the
// device's cookie).
const OfflinePage = async () => {
  const t = await getTranslations("layout.offline");

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 text-center">
      <h1 className="text-xl font-bold">{t("title")}</h1>
      <p className="mt-2 text-sm text-muted">{t("body")}</p>
      <OfflineRetryButton />
    </main>
  );
};

export default OfflinePage;

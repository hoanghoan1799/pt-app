import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { AppHeader } from "@/components/layout/AppHeader";
import { ROUTES } from "@/constants/routes";
import { PAGE_CONTAINER } from "@/constants/styles";
import { ChangePasswordForm } from "@/features/auth/components/ChangePasswordForm";
import { requireUser } from "@/services/auth-guard";

export const generateMetadata = async (): Promise<Metadata> => {
  const t = await getTranslations("pages.changePassword");

  return { title: t("metaTitle") };
};

const ChangePasswordPage = async () => {
  const user = await requireUser();
  const t = await getTranslations("pages.changePassword");

  return (
    <>
      <AppHeader
        eyebrow={user.email ?? user.name}
        title={t("title")}
        backHref={ROUTES.WORKOUTS}
      />
      <main
        className={`${PAGE_CONTAINER} space-y-4 pt-4 pb-[calc(env(safe-area-inset-bottom)+6rem)]`}
      >
        <ChangePasswordForm />
        <p className="text-sm text-muted">{t("forgotHint")}</p>
      </main>
    </>
  );
};

export default ChangePasswordPage;

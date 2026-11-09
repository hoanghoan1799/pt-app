import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { AppHeader } from "@/components/layout/AppHeader";
import { ROUTES } from "@/constants/routes";
import { PAGE_CONTAINER } from "@/constants/styles";
import { FoodForm } from "@/features/foods/components/FoodForm";
import { requireSuperAdmin } from "@/services/auth-guard";

export const generateMetadata = async (): Promise<Metadata> => {
  const t = await getTranslations("pages.adminFoodNew");

  return { title: t("metaTitle") };
};

const NewFoodPage = async () => {
  await requireSuperAdmin();
  const t = await getTranslations("pages.adminFoodNew");

  return (
    <>
      <AppHeader
        eyebrow={t("eyebrow")}
        title={t("title")}
        backHref={ROUTES.ADMIN_FOODS}
      />
      <main
        className={`${PAGE_CONTAINER} pt-4 pb-[calc(env(safe-area-inset-bottom)+2rem)]`}
      >
        <FoodForm food={null} />
      </main>
    </>
  );
};

export default NewFoodPage;

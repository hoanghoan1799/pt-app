import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";

import { ScrollToTopButton } from "@/components/common/ScrollToTopButton";
import { AppHeader } from "@/components/layout/AppHeader";
import { ROUTES } from "@/constants/routes";
import { BUTTON_PRIMARY, PAGE_CONTAINER } from "@/constants/styles";
import { FoodList } from "@/features/foods/components/FoodList";
import { listFoods } from "@/features/foods/services/food-queries";
import { localizeFoods } from "@/features/foods/utils/food-locale";
import { requireSuperAdmin } from "@/services/auth-guard";

export const generateMetadata = async (): Promise<Metadata> => {
  const t = await getTranslations("pages.adminFoods");

  return { title: t("metaTitle") };
};

const AdminFoodsPage = async () => {
  await requireSuperAdmin();
  const t = await getTranslations("pages.adminFoods");

  const foods = localizeFoods(await listFoods("admin"), await getLocale());

  return (
    <>
      <AppHeader
        eyebrow={t("eyebrow")}
        title={t("title")}
        backHref={ROUTES.ADMIN}
      />
      <main
        className={`${PAGE_CONTAINER} space-y-4 pt-4 pb-[calc(env(safe-area-inset-bottom)+2rem)]`}
      >
        <Link
          href={ROUTES.ADMIN_FOODS_NEW}
          className={`${BUTTON_PRIMARY} w-full`}
        >
          <Plus className="size-5" aria-hidden />
          {t("addFood")}
        </Link>
        <FoodList
          foods={foods}
          basePath={ROUTES.ADMIN_FOODS}
          emptyHint={t("emptyHint")}
        />
      </main>
      <ScrollToTopButton />
    </>
  );
};

export default AdminFoodsPage;

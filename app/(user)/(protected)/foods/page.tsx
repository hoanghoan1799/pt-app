import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { AppHeader } from "@/components/layout/AppHeader";
import { ROUTES } from "@/constants/routes";
import { PAGE_CONTAINER } from "@/constants/styles";
import { FoodList } from "@/features/foods/components/FoodList";
import { listFoods } from "@/features/foods/services/food-queries";
import { requireUser } from "@/services/auth-guard";

export const generateMetadata = async (): Promise<Metadata> => {
  const t = await getTranslations("pages.foods");

  return { title: t("metaTitle") };
};

const FoodsPage = async () => {
  await requireUser();
  const t = await getTranslations("pages.foods");

  const foods = await listFoods();

  return (
    <>
      <AppHeader
        eyebrow={t("eyebrow")}
        title={t("title")}
        backHref={ROUTES.NUTRITION}
      />
      <main
        className={`${PAGE_CONTAINER} space-y-4 pt-4 pb-[calc(env(safe-area-inset-bottom)+6rem)]`}
      >
        <FoodList
          foods={foods}
          basePath={ROUTES.FOODS}
          emptyHint={t("emptyHint")}
        />
      </main>
    </>
  );
};

export default FoodsPage;

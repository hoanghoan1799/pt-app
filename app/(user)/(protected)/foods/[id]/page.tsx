import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";

import { AppHeader } from "@/components/layout/AppHeader";
import { ROUTES } from "@/constants/routes";
import { PAGE_CONTAINER } from "@/constants/styles";
import { FoodDetail } from "@/features/foods/components/FoodDetail";
import { getFood } from "@/features/foods/services/food-queries";
import { localizeFood } from "@/features/foods/utils/food-locale";
import { requireUser } from "@/services/auth-guard";

export const generateMetadata = async (): Promise<Metadata> => {
  const t = await getTranslations("pages.foodDetail");

  return { title: t("metaTitle") };
};

const FoodPage = async ({ params }: PageProps<"/foods/[id]">) => {
  await requireUser();
  const t = await getTranslations("pages.foodDetail");

  const { id } = await params;
  const raw = await getFood(Number(id));

  if (!raw) {
    notFound();
  }
  const food = localizeFood(raw, await getLocale());

  return (
    <>
      <AppHeader
        eyebrow={t("eyebrow")}
        title={food.name}
        backHref={ROUTES.FOODS}
      />
      <main
        className={`${PAGE_CONTAINER} pt-4 pb-[calc(env(safe-area-inset-bottom)+6rem)]`}
      >
        <FoodDetail food={food} />
      </main>
    </>
  );
};

export default FoodPage;

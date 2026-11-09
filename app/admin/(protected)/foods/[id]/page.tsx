import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { AppHeader } from "@/components/layout/AppHeader";
import { ROUTES } from "@/constants/routes";
import { PAGE_CONTAINER, SECTION_TITLE } from "@/constants/styles";
import { DeleteFoodButton } from "@/features/foods/components/DeleteFoodButton";
import { FoodDetail } from "@/features/foods/components/FoodDetail";
import { FoodForm } from "@/features/foods/components/FoodForm";
import { getFood } from "@/features/foods/services/food-queries";
import { requireSuperAdmin } from "@/services/auth-guard";

export const generateMetadata = async (): Promise<Metadata> => {
  const t = await getTranslations("pages.adminFoodDetail");

  return { title: t("metaTitle") };
};

const AdminFoodPage = async ({ params }: PageProps<"/admin/foods/[id]">) => {
  await requireSuperAdmin();
  const t = await getTranslations("pages.adminFoodDetail");

  const { id } = await params;
  const food = await getFood(Number(id));

  if (!food) {
    notFound();
  }

  return (
    <>
      <AppHeader
        eyebrow={t("eyebrow")}
        title={food.name}
        backHref={ROUTES.ADMIN_FOODS}
      />
      <main
        className={`${PAGE_CONTAINER} space-y-6 pt-4 pb-[calc(env(safe-area-inset-bottom)+2rem)]`}
      >
        <FoodDetail food={food} />
        <section className="space-y-3">
          <h2 className={SECTION_TITLE}>{t("edit")}</h2>
          <FoodForm food={food} />
        </section>
        <DeleteFoodButton foodId={food.id} />
      </main>
    </>
  );
};

export default AdminFoodPage;

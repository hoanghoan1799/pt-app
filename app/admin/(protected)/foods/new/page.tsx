import type { Metadata } from "next";

import { AppHeader } from "@/components/layout/AppHeader";
import { ROUTES } from "@/constants/routes";
import { PAGE_CONTAINER } from "@/constants/styles";
import { FoodForm } from "@/features/foods/components/FoodForm";
import { requireSuperAdmin } from "@/services/auth-guard";

export const metadata: Metadata = { title: "Thêm món" };

const NewFoodPage = async () => {
  await requireSuperAdmin();

  return (
    <>
      <AppHeader
        eyebrow="Thực phẩm"
        title="Thêm món"
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

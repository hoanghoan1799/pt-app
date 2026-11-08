import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { AppHeader } from "@/components/layout/AppHeader";
import { ROUTES } from "@/constants/routes";
import { BUTTON_PRIMARY, PAGE_CONTAINER } from "@/constants/styles";
import { FoodList } from "@/features/foods/components/FoodList";
import { listFoods } from "@/features/foods/services/food-queries";
import { requireSuperAdmin } from "@/services/auth-guard";

export const metadata: Metadata = { title: "Thực phẩm" };

const AdminFoodsPage = async () => {
  await requireSuperAdmin();

  const foods = await listFoods();

  return (
    <>
      <AppHeader eyebrow="Admin" title="Thực phẩm" backHref={ROUTES.ADMIN} />
      <main
        className={`${PAGE_CONTAINER} space-y-4 pt-4 pb-[calc(env(safe-area-inset-bottom)+2rem)]`}
      >
        <Link
          href={ROUTES.ADMIN_FOODS_NEW}
          className={`${BUTTON_PRIMARY} w-full`}
        >
          <Plus className="size-5" aria-hidden />
          Thêm món
        </Link>
        <FoodList
          foods={foods}
          basePath={ROUTES.ADMIN_FOODS}
          emptyHint="Bấm Thêm món để nhập món đầu tiên."
        />
      </main>
    </>
  );
};

export default AdminFoodsPage;

"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { useConfirm } from "@/components/common/ConfirmDialog/use-confirm";
import { useMealPlanAction } from "@/features/meal-plans/hooks/use-meal-plan-action";
import { removeMealLogAction } from "@/features/meal-plans/services/meal-log-actions";
import type { MealLog } from "@/features/meal-plans/types/meal-log";

interface SheetState {
  isOpen: boolean;
  // The log being edited; null = add.
  editing: MealLog | null;
}

export const useTraineeMealCard = () => {
  const t = useTranslations("mealPlans.useTraineeMealCard");
  const confirm = useConfirm();
  const { isPending, run } = useMealPlanAction();
  const [sheet, setSheet] = useState<SheetState>({
    isOpen: false,
    editing: null,
  });

  return {
    sheet,
    isPending,
    openAdd: () => setSheet({ isOpen: true, editing: null }),
    openEdit: (log: MealLog) => setSheet({ isOpen: true, editing: log }),
    // Keeps `editing` while closing so the sheet doesn't flash.
    setIsOpen: (isOpen: boolean) =>
      setSheet((previous) => ({ ...previous, isOpen })),
    remove: async (log: MealLog) => {
      const isConfirmed = await confirm({
        title: t("removeConfirm"),
        confirmLabel: t("confirmDelete"),
        isDanger: true,
      });

      if (!isConfirmed) {
        return;
      }
      run(() => removeMealLogAction({ logId: log.id }), {
        successMessage: t("removed"),
      });
    },
  };
};

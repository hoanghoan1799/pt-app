"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { toast } from "sonner";

import { useConfirm } from "@/components/common/ConfirmDialog/use-confirm";
import { Spinner } from "@/components/common/Spinner";
import { ROUTES } from "@/constants/routes";
import { BUTTON_DANGER } from "@/constants/styles";
import { archiveFoodAction } from "@/features/foods/services/food-actions";
import { describeErrorReference } from "@/utils/errors";

interface DeleteFoodButtonProps {
  foodId: number;
}

// "Xóa" archives the food: it disappears from both lists but the row stays.
export const DeleteFoodButton = ({ foodId }: DeleteFoodButtonProps) => {
  const t = useTranslations("foods.deleteFoodButton");
  const router = useRouter();
  const confirm = useConfirm();
  const [isPending, startTransition] = useTransition();

  const handleClick = async () => {
    const isConfirmed = await confirm({
      title: t("deleteConfirm"),
      confirmLabel: t("confirmDelete"),
      isDanger: true,
    });

    if (!isConfirmed) {
      return;
    }
    startTransition(async () => {
      const result = await archiveFoodAction(foodId);

      if (result.status === "error") {
        toast.error(result.message, {
          description: describeErrorReference(result.reference),
        });
        return;
      }
      toast.success(t("deleted"));
      router.replace(ROUTES.ADMIN_FOODS);
    });
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      aria-busy={isPending}
      className={`${BUTTON_DANGER} w-full`}
    >
      {isPending ? (
        <Spinner size="md" />
      ) : (
        <Trash2 className="size-5" aria-hidden />
      )}
      {t("confirmDelete")}
    </button>
  );
};

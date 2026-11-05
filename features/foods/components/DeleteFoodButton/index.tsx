"use client";

import { Loader2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { useConfirm } from "@/components/common/ConfirmDialog/use-confirm";
import { ROUTES } from "@/constants/routes";
import { BUTTON_DANGER } from "@/constants/styles";
import { FOOD_MESSAGES } from "@/features/foods/constants/foods";
import { archiveFoodAction } from "@/features/foods/services/food-actions";
import { describeErrorReference } from "@/utils/errors";

interface DeleteFoodButtonProps {
  foodId: number;
}

// "Xóa" archives the food: it disappears from both lists but the row stays.
export const DeleteFoodButton = ({ foodId }: DeleteFoodButtonProps) => {
  const router = useRouter();
  const confirm = useConfirm();
  const [isPending, startTransition] = useTransition();

  const handleClick = async () => {
    const isConfirmed = await confirm({
      title: FOOD_MESSAGES.DELETE_CONFIRM,
      confirmLabel: "Xóa",
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
      toast.success(FOOD_MESSAGES.DELETED);
      router.replace(ROUTES.ADMIN_FOODS);
    });
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      className={`${BUTTON_DANGER} w-full`}
    >
      {isPending ? (
        <Loader2 className="size-5 animate-spin" aria-hidden />
      ) : (
        <Trash2 className="size-5" aria-hidden />
      )}
      Xóa
    </button>
  );
};

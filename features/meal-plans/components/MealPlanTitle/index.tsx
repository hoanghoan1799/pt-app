import { ChevronsDownUp, ChevronsUpDown } from "lucide-react";

import { SECTION_TITLE } from "@/constants/styles";

interface MealPlanTitleProps {
  isAllCollapsed?: boolean;
  // Omit when the day has no plan: there is nothing to fold.
  onToggleAll?: () => void;
}

// "Plan bữa ăn" title row with the fold-all / unfold-all button.
export const MealPlanTitle = ({
  isAllCollapsed = false,
  onToggleAll,
}: MealPlanTitleProps) => {
  const Icon = isAllCollapsed ? ChevronsUpDown : ChevronsDownUp;

  return (
    <div className="flex min-h-11 items-center justify-between gap-2">
      <h3 className={SECTION_TITLE}>Plan bữa ăn</h3>
      {onToggleAll && (
        <button
          type="button"
          onClick={onToggleAll}
          className="inline-flex min-h-11 items-center gap-1.5 px-2 text-sm font-medium text-accent"
        >
          <Icon className="size-4" aria-hidden />
          {isAllCollapsed ? "Mở tất cả" : "Thu gọn tất cả"}
        </button>
      )}
    </div>
  );
};

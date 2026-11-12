import { ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";

import { ICON_BUTTON } from "@/constants/styles";

interface MealCollapseToggleProps {
  mealName: string;
  isCollapsed: boolean;
  // Id of the card body this button shows and hides.
  controlsId: string;
  onToggle: () => void;
}

// Disclosure button at the start of a meal card header.
export const MealCollapseToggle = ({
  mealName,
  isCollapsed,
  controlsId,
  onToggle,
}: MealCollapseToggleProps) => {
  const t = useTranslations("mealPlans.mealCollapseToggle");

  return (
    <button
      type="button"
      onClick={onToggle}
      className={ICON_BUTTON}
      aria-expanded={!isCollapsed}
      aria-controls={controlsId}
      aria-label={
        isCollapsed
          ? t("expand", { name: mealName })
          : t("collapse", { name: mealName })
      }
    >
      <ChevronRight
        className={`size-5 transition-transform ${isCollapsed ? "" : "rotate-90"}`}
        aria-hidden
      />
    </button>
  );
};

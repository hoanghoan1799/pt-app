import { ChevronRight } from "lucide-react";

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
}: MealCollapseToggleProps) => (
  <button
    type="button"
    onClick={onToggle}
    className={ICON_BUTTON}
    aria-expanded={!isCollapsed}
    aria-controls={controlsId}
    aria-label={isCollapsed ? `Mở ${mealName}` : `Thu gọn ${mealName}`}
  >
    <ChevronRight
      className={`size-5 transition-transform ${isCollapsed ? "" : "rotate-90"}`}
      aria-hidden
    />
  </button>
);

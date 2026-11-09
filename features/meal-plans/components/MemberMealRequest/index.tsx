import { MessageSquareQuote } from "lucide-react";
import { useTranslations } from "next-intl";

interface MemberMealRequestProps {
  preferredMealCount: number | null;
  // Meals in the day's plan; null while the day has no plan.
  planMealCount: number | null;
  foodNote: string | null;
}

// What the trainee asked for (Q1), above the PT's plan. The meal count is
// only mentioned when the plan has a different number of meals (Q2).
export const MemberMealRequest = ({
  preferredMealCount,
  planMealCount,
  foodNote,
}: MemberMealRequestProps) => {
  const t = useTranslations("mealPlans.memberMealRequest");
  const isCountDifferent =
    preferredMealCount !== null &&
    planMealCount !== null &&
    preferredMealCount !== planMealCount;

  if (!isCountDifferent && !foodNote) {
    return null;
  }

  return (
    <div className="space-y-1 rounded-xl bg-accent/10 px-3 py-2.5 text-sm text-fg">
      <p className="flex items-center gap-2 text-xs font-semibold text-accent">
        <MessageSquareQuote className="size-4 shrink-0" aria-hidden />
        {t("title")}
      </p>
      {isCountDifferent && (
        <p>{t("wantsMeals", { count: preferredMealCount })}</p>
      )}
      {foodNote && <p className="whitespace-pre-line">{foodNote}</p>}
    </div>
  );
};

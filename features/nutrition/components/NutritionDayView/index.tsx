import { MessageSquareQuote } from "lucide-react";

import { CARD, SECTION_TITLE } from "@/constants/styles";
import { FoodLog } from "@/features/nutrition/components/FoodLog";
import { MacroProgressList } from "@/features/nutrition/components/MacroProgressList";
import type { NutritionDay } from "@/features/nutrition/types/nutrition";
import { formatFullDay } from "@/utils/week";

interface NutritionDayViewProps {
  day: NutritionDay;
  today: string;
  isEditable: boolean;
}

export const NutritionDayView = ({
  day,
  today,
  isEditable,
}: NutritionDayViewProps) => {
  const isFuture = day.date > today;
  const getEmptyMessage = () => {
    if (!isEditable) {
      return "User chưa ghi bữa ăn nào cho ngày này.";
    }
    return isFuture
      ? "Chưa tới ngày này, quay lại ghi sau nhé."
      : "Chưa ghi bữa ăn nào cho ngày này.";
  };

  return (
    <section className="space-y-4">
      <div>
        <p className="text-sm font-medium text-muted">
          {formatFullDay(day.date)}
          {day.date === today && (
            <span className="text-accent"> · Hôm nay</span>
          )}
        </p>
        <h2 className="mt-0.5 text-2xl leading-tight font-bold text-fg">
          {day.target ? "Mục tiêu trong ngày" : "Dinh dưỡng"}
        </h2>
      </div>

      <div className={`${CARD} space-y-4 p-4`}>
        {day.target ? (
          <MacroProgressList totals={day.totals} target={day.target} />
        ) : (
          <>
            <p className="text-sm text-muted">
              PT chưa đặt mục tiêu dinh dưỡng cho ngày này.
            </p>
            {day.entries.length > 0 && (
              <MacroProgressList totals={day.totals} target={null} />
            )}
          </>
        )}
        {day.target?.note && (
          <p className="flex gap-2 rounded-xl bg-accent/10 px-3 py-2.5 text-sm text-fg">
            <MessageSquareQuote
              className="mt-0.5 size-4 shrink-0 text-accent"
              aria-hidden
            />
            <span className="whitespace-pre-line">{day.target.note}</span>
          </p>
        )}
      </div>

      <div className="space-y-2">
        <h3 className={SECTION_TITLE}>Đã ăn</h3>
        <FoodLog
          date={day.date}
          entries={day.entries}
          isEditable={isEditable && !isFuture}
          emptyMessage={getEmptyMessage()}
        />
      </div>
    </section>
  );
};

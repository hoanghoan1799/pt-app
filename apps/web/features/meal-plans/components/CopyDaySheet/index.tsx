"use client";

import clsx from "clsx";
import { useLocale, useTranslations } from "next-intl";

import { BottomSheet } from "@/components/common/BottomSheet";
import { MonthGrid } from "@/components/common/MonthGrid";
import { Spinner } from "@/components/common/Spinner";
import {
  BUTTON_DANGER,
  BUTTON_PRIMARY,
  BUTTON_SECONDARY,
} from "@/constants/styles";
import { useCopyDay } from "@/features/meal-plans/hooks/use-copy-day";
import type { CopyCalendarDay } from "@/features/meal-plans/utils/copy-calendar";
import {
  formatOverwriteLogWarning,
  formatOverwriteQuestion,
} from "@/features/meal-plans/utils/overwrite-message";
import { formatFullDay } from "@/utils/week";

interface CopyDaySheetProps {
  userId: number;
  dayId: number;
  sourceDate: string;
  // Today in the app time zone, read on the server.
  today: string;
  // Plans and logs of the loaded weeks; other months are read when shown.
  datesWithPlan: string[];
  // Dates where the trainee logged or marked meals: overwriting deletes those.
  datesWithLogs: string[];
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}

export const CopyDaySheet = ({
  userId,
  dayId,
  sourceDate,
  today,
  datesWithPlan,
  datesWithLogs,
  isOpen,
  onOpenChange,
}: CopyDaySheetProps) => {
  const locale = useLocale();
  const t = useTranslations("mealPlans.copyDaySheet");
  const tWeek = useTranslations("common.week");

  const getTag = (day: CopyCalendarDay) => {
    if (day.isToday) {
      return tWeek("today");
    }
    if (day.isTomorrow) {
      return tWeek("tomorrow");
    }
    return "";
  };

  const describeDay = (day: CopyCalendarDay) =>
    [
      formatFullDay(day.date, locale),
      getTag(day),
      day.isSource && t("sourceDay"),
      day.isPast && t("past"),
      day.hasPlan && t("hasPlan"),
    ]
      .filter(Boolean)
      .join(", ");

  const copy = useCopyDay({
    userId,
    dayId,
    sourceDate,
    today,
    datesWithPlan,
    datesWithLogs,
    isOpen,
    onDone: () => onOpenChange(false),
  });

  const daysByDate = new Map(
    copy.cells.flatMap((day) => (day ? [[day.date, day] as const] : [])),
  );
  const logWarning = formatOverwriteLogWarning(
    copy.overwriteDates,
    copy.logDates,
    locale,
  );

  return (
    <BottomSheet
      isOpen={isOpen}
      onOpenChange={(open) => {
        copy.cancel();
        onOpenChange(open);
      }}
      title={t("title")}
      description={t("description", {
        date: formatFullDay(sourceDate, locale),
      })}
    >
      {copy.isConfirming ? (
        <div
          role="alertdialog"
          aria-label={t("confirmLabel")}
          className="space-y-4"
        >
          <p className="text-[15px] font-medium text-fg">
            {formatOverwriteQuestion(copy.overwriteDates, locale)}
          </p>
          {logWarning && (
            <p className="text-sm font-medium text-warning">{logWarning}</p>
          )}
          <p className="text-sm text-muted">
            {t("replaceNotice", { date: formatFullDay(sourceDate, locale) })}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={copy.cancel}
              className={BUTTON_SECONDARY}
            >
              {t("cancel")}
            </button>
            <button
              type="button"
              onClick={copy.confirm}
              disabled={copy.isPending}
              aria-busy={copy.isPending}
              className={BUTTON_DANGER}
            >
              {copy.isPending && <Spinner size="md" />}
              {t("overwrite")}
            </button>
          </div>
        </div>
      ) : (
        <div>
          <MonthGrid
            month={copy.month}
            canGoBack={copy.canGoBack}
            onPreviousMonth={copy.goToPreviousMonth}
            onNextMonth={copy.goToNextMonth}
            renderDay={(date) => {
              const day = daysByDate.get(date);

              if (!day) {
                return null;
              }

              const isSelected = copy.selected.includes(day.date);

              return (
                <button
                  type="button"
                  aria-label={describeDay(day)}
                  aria-disabled={day.isDisabled || undefined}
                  aria-pressed={day.isDisabled ? undefined : isSelected}
                  tabIndex={day.isDisabled ? -1 : undefined}
                  onClick={() => {
                    if (!day.isDisabled) {
                      copy.toggle(day.date);
                    }
                  }}
                  className={clsx(
                    "relative flex min-h-13 min-w-0 flex-col items-center justify-center gap-px overflow-hidden rounded-xl border py-0.5 transition",
                    day.isDisabled
                      ? "cursor-not-allowed border-transparent opacity-35"
                      : "border-line active:scale-[0.97]",
                    day.isPast && "line-through",
                    !day.isDisabled && "bg-surface",
                    day.isTomorrow &&
                      !isSelected &&
                      "bg-accent/15 border-accent/30",
                    day.isToday &&
                      !isSelected &&
                      "border-2 border-accent text-accent",
                    isSelected && "border-accent bg-accent text-accent-fg",
                    day.isToday && isSelected && "border-2",
                  )}
                >
                  <span className="text-[15px] font-bold">{day.day}</span>
                  <span className="h-2.5 text-[9px] leading-none font-medium tracking-tight whitespace-nowrap">
                    {getTag(day)}
                  </span>
                  {day.hasPlan && (
                    <span
                      aria-hidden
                      className={clsx(
                        "absolute top-1 right-1 size-1.5 rounded-full",
                        isSelected ? "bg-accent-fg" : "bg-warning",
                      )}
                    />
                  )}
                </button>
              );
            }}
          />
          <div className="sticky bottom-0 -mx-4 -mb-[calc(env(safe-area-inset-bottom)+1.25rem)] mt-3 bg-bg px-4 pt-2 pb-[calc(env(safe-area-inset-bottom)+1.25rem)]">
            <p className="mb-2 flex items-center gap-2 text-xs text-muted">
              <span
                aria-hidden
                className="size-1.5 shrink-0 rounded-full bg-warning"
              />
              {t("overwriteLegend")}
            </p>
            <button
              type="button"
              onClick={copy.submit}
              disabled={
                copy.isPending || copy.isLoading || copy.selected.length === 0
              }
              aria-busy={copy.isPending}
              className={`${BUTTON_PRIMARY} w-full`}
            >
              {copy.isPending && <Spinner size="md" />}
              {t("copy")}
              {copy.selected.length > 0 &&
                t("copyCount", { count: copy.selected.length })}
            </button>
          </div>
        </div>
      )}
    </BottomSheet>
  );
};

"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { useMealPlanAction } from "@/features/meal-plans/hooks/use-meal-plan-action";
import {
  buildCopyMonth,
  canGoToPreviousMonth,
  getMonthEnd,
  getMonthOf,
  getMonthStart,
  mergeMonthDates,
  type MonthInfo,
  shiftMonth,
} from "@/features/meal-plans/utils/copy-calendar";
import {
  copyDayToDatesAction,
  getWorkoutCopyMonthInfoAction,
} from "@/features/workouts/services/workout-actions";

interface CopyWorkoutDayOptions {
  userId: number;
  sourceDate: string;
  // Today in the app time zone, from the server (no hydration mismatch).
  today: string;
  // Workouts and logged sets of the week the page loaded: shown until a month
  // is read.
  datesWithPlan: string[];
  datesWithLogs: string[];
  isOpen: boolean;
  onDone: () => void;
}

// "Sao chép sang ngày khác" for a workout day: the month shown, the picked
// dates and the copy itself. Days with logged sets can't be picked.
export const useCopyWorkoutDay = ({
  userId,
  sourceDate,
  today,
  datesWithPlan,
  datesWithLogs,
  isOpen,
  onDone,
}: CopyWorkoutDayOptions) => {
  const t = useTranslations("workouts.useCopyWorkoutDay");
  const [month, setMonth] = useState(getMonthOf(today));
  const [selected, setSelected] = useState<string[]>([]);
  // Workouts and logs per month, read each time the sheet opens so the dots
  // are never older than the sheet. `null` marks a month whose read failed:
  // the page's data still applies.
  const [loaded, setLoaded] = useState<Record<string, MonthInfo | null>>({});
  // True while the overwrite question is shown instead of the month grid.
  const [isConfirming, setIsConfirming] = useState(false);
  const { isPending, run } = useMealPlanAction();

  const [wasOpen, setWasOpen] = useState(isOpen);

  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen) {
      setLoaded({});
      setMonth(getMonthOf(today));
    }
  }

  const isMonthLoaded = month in loaded;

  useEffect(() => {
    if (!isOpen || isMonthLoaded) {
      return;
    }

    let isCurrent = true;

    getWorkoutCopyMonthInfoAction({
      userId,
      from: getMonthStart(month),
      to: getMonthEnd(month),
    }).then((result) => {
      if (!isCurrent) {
        return;
      }
      if (result.status === "error") {
        toast.error(result.message);
      }
      setLoaded((previous) => ({
        ...previous,
        [month]:
          result.status === "success"
            ? { planDates: result.planDates, logDates: result.logDates }
            : null,
      }));
    });
    return () => {
      isCurrent = false;
    };
  }, [isOpen, isMonthLoaded, month, userId]);

  const planDates = mergeMonthDates(datesWithPlan, loaded, "planDates");
  const logDates = mergeMonthDates(datesWithLogs, loaded, "logDates");

  const cells = buildCopyMonth({
    month,
    today,
    sourceDate,
    datesWithPlan: planDates,
  }).map((day) => {
    if (!day) {
      return null;
    }

    const hasSets = logDates.includes(day.date);

    return { ...day, hasSets, isDisabled: day.isDisabled || hasSets };
  });

  // A month read after the pick can reveal logged sets: those are dropped.
  const targets = selected.filter((date) => !logDates.includes(date));
  const overwriteDates = targets
    .filter((date) => planDates.includes(date))
    .sort();

  const toggle = (date: string) => {
    setSelected((previous) =>
      previous.includes(date)
        ? previous.filter((item) => item !== date)
        : [...previous, date],
    );
  };

  const copy = () => {
    setIsConfirming(false);
    run(
      () => copyDayToDatesAction({ userId, date: sourceDate, dates: targets }),
      {
        successMessage: (result) =>
          "copied" in result ? t("copied", { copied: result.copied }) : "",
        onSuccess: () => {
          setSelected([]);
          onDone();
        },
      },
    );
  };

  // Asks first only when a chosen day would lose its workout.
  const submit = () => {
    if (overwriteDates.length) {
      setIsConfirming(true);
      return;
    }
    copy();
  };

  return {
    month,
    cells,
    canGoBack: canGoToPreviousMonth(month, today),
    goToPreviousMonth: () => setMonth((value) => shiftMonth(value, -1)),
    goToNextMonth: () => setMonth((value) => shiftMonth(value, 1)),
    selected: targets,
    toggle,
    submit,
    confirm: copy,
    cancel: () => setIsConfirming(false),
    isConfirming,
    overwriteDates,
    // Copying waits for the shown month's data, so an overwrite is never missed.
    isLoading: isOpen && !isMonthLoaded,
    isPending,
  };
};

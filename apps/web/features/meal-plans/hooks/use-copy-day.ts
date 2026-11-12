"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { useMealPlanAction } from "@/features/meal-plans/hooks/use-meal-plan-action";
import {
  copyDayAction,
  getCopyMonthInfoAction,
} from "@/features/meal-plans/services/meal-plan-actions";
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
import { getOverwriteDates } from "@/features/meal-plans/utils/overwrite-message";

interface CopyDayOptions {
  userId: number;
  dayId: number;
  sourceDate: string;
  // Today in the app time zone, from the server (no hydration mismatch).
  today: string;
  // Plans and logs of the weeks the page loaded: shown until a month is read.
  datesWithPlan: string[];
  datesWithLogs: string[];
  isOpen: boolean;
  onDone: () => void;
}

// "Sao chép sang ngày khác": the month shown, which dates are picked and the
// copy itself.
export const useCopyDay = ({
  userId,
  dayId,
  sourceDate,
  today,
  datesWithPlan,
  datesWithLogs,
  isOpen,
  onDone,
}: CopyDayOptions) => {
  const t = useTranslations("mealPlans.useCopyDay");
  const [month, setMonth] = useState(getMonthOf(today));
  const [selected, setSelected] = useState<string[]>([]);
  // Plans and logs per month, read from the server each time the sheet opens
  // so the dots are never older than the sheet. `null` marks a month whose
  // read failed: it stops blocking the button but the page's data still applies.
  const [loaded, setLoaded] = useState<Record<string, MonthInfo | null>>({});
  // True while the "Ghi đè" question is shown instead of the month grid.
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

    getCopyMonthInfoAction({
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
      // On failure the page's own weeks are all there is to go on.
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
  });
  const overwriteDates = getOverwriteDates(selected, planDates);

  const toggle = (date: string) => {
    setSelected((previous) =>
      previous.includes(date)
        ? previous.filter((item) => item !== date)
        : [...previous, date],
    );
  };

  const copy = () => {
    setIsConfirming(false);
    run(() => copyDayAction({ userId, dayId, dates: selected }), {
      successMessage: (result) =>
        "copied" in result ? t("copied", { copied: result.copied }) : "",
      onSuccess: () => {
        setSelected([]);
        onDone();
      },
    });
  };

  // Asks first only when a chosen day would lose its plan.
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
    selected,
    toggle,
    submit,
    confirm: copy,
    cancel: () => setIsConfirming(false),
    isConfirming,
    overwriteDates,
    logDates,
    // Copying waits for the shown month's plans, so an overwrite is never missed.
    isLoading: isOpen && !isMonthLoaded,
    isPending,
  };
};

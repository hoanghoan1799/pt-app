"use client";

import clsx from "clsx";
import { ChevronDown, Copy } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { BottomSheet } from "@/components/common/BottomSheet";
import { MonthGrid } from "@/components/common/MonthGrid";
import { SubmitButton } from "@/components/common/SubmitButton";
import {
  BUTTON_PRIMARY,
  BUTTON_SECONDARY,
  INPUT,
  LABEL,
} from "@/constants/styles";
import { useCopyWeek } from "@/features/workouts/hooks/use-copy-week";
import type { MemberOption } from "@/features/workouts/types/workout";
import { getMonthOf, shiftMonth } from "@/utils/month";
import {
  addDays,
  formatFullDay,
  formatWeekRange,
  getWeekStart,
} from "@/utils/week";

interface CopyWeekButtonProps {
  userId: number;
  weekStart: string;
  defaultTargetDate: string;
  // Today in the app time zone, read on the server.
  today: string;
  members: MemberOption[];
}

export const CopyWeekButton = ({
  userId,
  weekStart,
  defaultTargetDate,
  today,
  members,
}: CopyWeekButtonProps) => {
  const t = useTranslations("workouts.copyWeek");
  const tWeek = useTranslations("common.week");
  const { isOpen, setIsOpen, formAction, handleSubmit, isPending } =
    useCopyWeek();
  const [targetDate, setTargetDate] = useState(defaultTargetDate);
  const [month, setMonth] = useState(getMonthOf(defaultTargetDate));

  const handleOpenChange = (open: boolean) => {
    if (open) {
      setTargetDate(defaultTargetDate);
      setMonth(getMonthOf(defaultTargetDate));
    }
    setIsOpen(open);
  };

  const targetWeek = getWeekStart(targetDate);
  const sourceEnd = addDays(weekStart, 6);

  return (
    <>
      <button
        type="button"
        onClick={() => handleOpenChange(true)}
        className={`${BUTTON_SECONDARY} w-full`}
      >
        <Copy className="size-5" aria-hidden />
        {t("trigger")}
      </button>
      <BottomSheet
        isOpen={isOpen}
        onOpenChange={handleOpenChange}
        title={t("title")}
        description={t("description", { week: formatWeekRange(weekStart) })}
      >
        <form action={formAction} onSubmit={handleSubmit} className="space-y-4">
          <input type="hidden" name="userId" value={userId} />
          <input type="hidden" name="fromWeek" value={weekStart} />
          <div>
            <label htmlFor="targetUserId" className={LABEL}>
              {t("targetUser")}
            </label>
            <div className="relative">
              <select
                id="targetUserId"
                name="targetUserId"
                defaultValue={userId}
                className={`${INPUT} appearance-none pr-11`}
              >
                {members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                    {member.id === userId ? t("thisUserSuffix") : ""}
                  </option>
                ))}
              </select>
              <ChevronDown
                className="pointer-events-none absolute top-1/2 right-4 size-5 -translate-y-1/2 text-muted"
                aria-hidden
              />
            </div>
          </div>
          <div>
            <p className={LABEL}>{t("targetDate")}</p>
            <input type="hidden" name="targetDate" value={targetDate} />
            <MonthGrid
              month={month}
              onPreviousMonth={() => setMonth((value) => shiftMonth(value, -1))}
              onNextMonth={() => setMonth((value) => shiftMonth(value, 1))}
              renderDay={(date) => {
                const isPicked = date === targetDate;
                const isInTargetWeek =
                  date >= targetWeek && date <= addDays(targetWeek, 6);
                const isSource = date >= weekStart && date <= sourceEnd;
                const isToday = date === today;

                return (
                  <button
                    type="button"
                    aria-label={[
                      formatFullDay(date),
                      isToday && tWeek("dayIsToday"),
                      isSource && t("sourceWeek"),
                    ]
                      .filter(Boolean)
                      .join(", ")}
                    aria-pressed={isPicked}
                    onClick={() => setTargetDate(date)}
                    className={clsx(
                      "flex min-h-13 min-w-0 flex-col items-center justify-center gap-px overflow-hidden rounded-xl border py-0.5 transition active:scale-[0.97]",
                      isPicked
                        ? "border-accent bg-accent text-accent-fg"
                        : isInTargetWeek
                          ? "border-accent/30 bg-accent/15"
                          : "border-line bg-surface",
                      isToday &&
                        (isPicked
                          ? "border-2"
                          : "border-2 border-accent text-accent"),
                    )}
                  >
                    <span className="text-[15px] font-bold">
                      {Number(date.slice(8, 10))}
                    </span>
                    <span className="h-2.5 text-[9px] leading-none font-medium tracking-tight whitespace-nowrap">
                      {isSource ? t("sourceBadge") : ""}
                    </span>
                  </button>
                );
              }}
            />
            <p className="mt-1.5 text-sm text-muted">{t("hint")}</p>
          </div>
          <SubmitButton
            className={`${BUTTON_PRIMARY} w-full`}
            isPending={isPending}
          >
            {t("submit")}
          </SubmitButton>
        </form>
      </BottomSheet>
    </>
  );
};

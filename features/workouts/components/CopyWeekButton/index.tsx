"use client";

import { ChevronDown, Copy } from "lucide-react";

import { BottomSheet } from "@/components/common/BottomSheet";
import { SubmitButton } from "@/components/common/SubmitButton";
import {
  BUTTON_PRIMARY,
  BUTTON_SECONDARY,
  INPUT,
  LABEL,
} from "@/constants/styles";
import { useCopyWeek } from "@/features/workouts/hooks/use-copy-week";
import type { MemberOption } from "@/features/workouts/types/workout";
import { formatWeekRange } from "@/features/workouts/utils/week";

interface CopyWeekButtonProps {
  userId: number;
  weekStart: string;
  defaultTargetDate: string;
  members: MemberOption[];
}

export const CopyWeekButton = ({
  userId,
  weekStart,
  defaultTargetDate,
  members,
}: CopyWeekButtonProps) => {
  const { isOpen, setIsOpen, formAction, handleSubmit } = useCopyWeek();

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className={`${BUTTON_SECONDARY} w-full`}
      >
        <Copy className="size-5" aria-hidden />
        Sao chép tuần này
      </button>
      <BottomSheet
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        title="Sao chép tuần"
        description={`Từ tuần ${formatWeekRange(weekStart)}`}
      >
        <form action={formAction} onSubmit={handleSubmit} className="space-y-4">
          <input type="hidden" name="userId" value={userId} />
          <input type="hidden" name="fromWeek" value={weekStart} />
          <div>
            <label htmlFor="targetUserId" className={LABEL}>
              Sang user
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
                    {member.id === userId ? " (user này)" : ""}
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
            <label htmlFor="targetDate" className={LABEL}>
              Sang tuần có ngày
            </label>
            <input
              id="targetDate"
              name="targetDate"
              type="date"
              defaultValue={defaultTargetDate}
              required
              className={`${INPUT} [&::-webkit-date-and-time-value]:text-left`}
            />
            <p className="mt-1.5 text-sm text-muted">
              Chọn ngày bất kỳ trong tuần đích. Lịch tuần đó sẽ được thay thế.
            </p>
          </div>
          <SubmitButton className={`${BUTTON_PRIMARY} w-full`}>
            Sao chép
          </SubmitButton>
        </form>
      </BottomSheet>
    </>
  );
};

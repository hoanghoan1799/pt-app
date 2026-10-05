"use client";

import { Activity, Pencil } from "lucide-react";
import { useState } from "react";

import { BottomSheet } from "@/components/common/BottomSheet";
import { BUTTON_PRIMARY, CARD, ICON_BUTTON } from "@/constants/styles";
import { BodyProfileForm } from "@/features/nutrition/components/BodyProfileForm";
import { EnergyPlanSummary } from "@/features/nutrition/components/EnergyPlanSummary";
import {
  ACTIVITY_LEVELS,
  GOALS,
  SEX_LABELS,
} from "@/features/nutrition/constants/energy";
import type {
  BodyProfile,
  BodyProfileEditor,
} from "@/features/nutrition/types/nutrition";
import {
  calculateEnergyPlan,
  formatDecimal,
} from "@/features/nutrition/utils/energy";

interface BodyProfileCardProps {
  editor: BodyProfileEditor;
  userId?: number;
  profile: BodyProfile | null;
  isTargetManual: boolean;
  today: string;
}

const COPY = {
  admin: {
    title: "Chỉ số cơ thể & TDEE",
    empty:
      "Nhập giới tính, tuổi, chiều cao, cân nặng và mức vận động để tính TDEE và tự điền mục tiêu dinh dưỡng. User cũng có thể tự nhập.",
    action: "Nhập chỉ số",
  },
  user: {
    title: "Chỉ số của bạn & TDEE",
    empty:
      "Nhập chiều cao, cân nặng và mức vận động để biết mỗi ngày bạn tiêu hao bao nhiêu calo và nên ăn bao nhiêu carb, protein, fat.",
    action: "Nhập chỉ số của bạn",
  },
} as const;

// A plain open/closed toggle around the form, so no separate hook/view.
export const BodyProfileCard = ({
  editor,
  userId,
  profile,
  isTargetManual,
  today,
}: BodyProfileCardProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const plan = profile ? calculateEnergyPlan(profile, today) : null;
  const copy = COPY[editor];

  return (
    <section className={`${CARD} p-4`}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-muted">
            <Activity className="size-4" aria-hidden />
            {copy.title}
          </p>
          {profile && plan && (
            <p className="mt-1 text-sm text-fg">
              {SEX_LABELS[profile.sex]} · {plan.age} tuổi ·{" "}
              {formatDecimal(profile.heightCm)} cm ·{" "}
              {formatDecimal(profile.weightKg)} kg
              <span className="block text-xs text-muted">
                Vận động{" "}
                {ACTIVITY_LEVELS[profile.activityLevel].label.toLowerCase()} ·
                Mục tiêu {GOALS[profile.goal].label.toLowerCase()}
              </span>
            </p>
          )}
        </div>
        {profile && (
          <button
            type="button"
            onClick={() => setIsOpen(true)}
            className={`${ICON_BUTTON} -mt-2 -mr-2 text-fg`}
            aria-label="Sửa chỉ số cơ thể"
          >
            <Pencil className="size-5" />
          </button>
        )}
      </div>

      {plan ? (
        <div className="mt-3">
          <EnergyPlanSummary plan={plan} />
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          <p className="text-sm text-muted">{copy.empty}</p>
          <button
            type="button"
            onClick={() => setIsOpen(true)}
            className={`${BUTTON_PRIMARY} w-full`}
          >
            {copy.action}
          </button>
        </div>
      )}

      <BottomSheet
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        title={editor === "admin" ? "Chỉ số cơ thể" : "Chỉ số của bạn"}
        description="Tính TDEE theo công thức Mifflin-St Jeor"
      >
        <BodyProfileForm
          editor={editor}
          userId={userId}
          profile={profile}
          isTargetManual={isTargetManual}
          today={today}
          onSaved={() => setIsOpen(false)}
        />
      </BottomSheet>
    </section>
  );
};

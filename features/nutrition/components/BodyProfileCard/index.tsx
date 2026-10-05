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
import type { BodyProfile } from "@/features/nutrition/types/nutrition";
import { calculateEnergyPlan } from "@/features/nutrition/utils/energy";

interface BodyProfileCardProps {
  userId: number;
  profile: BodyProfile | null;
  today: string;
}

// A plain open/closed toggle around the form, so no separate hook/view.
export const BodyProfileCard = ({
  userId,
  profile,
  today,
}: BodyProfileCardProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const plan = profile ? calculateEnergyPlan(profile, today) : null;

  return (
    <section className={`${CARD} p-4`}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-muted">
            <Activity className="size-4" aria-hidden />
            Chỉ số cơ thể & TDEE
          </p>
          {profile && plan && (
            <p className="mt-1 text-sm text-fg">
              {SEX_LABELS[profile.sex]} · {plan.age} tuổi · {profile.heightCm}{" "}
              cm · {profile.weightKg} kg
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
          <p className="text-sm text-muted">
            Nhập giới tính, tuổi, chiều cao, cân nặng và mức vận động để tính
            TDEE và tự điền mục tiêu dinh dưỡng.
          </p>
          <button
            type="button"
            onClick={() => setIsOpen(true)}
            className={`${BUTTON_PRIMARY} w-full`}
          >
            Nhập chỉ số
          </button>
        </div>
      )}

      <BottomSheet
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        title="Chỉ số cơ thể"
        description="Tính TDEE theo công thức Mifflin-St Jeor"
      >
        <BodyProfileForm
          userId={userId}
          profile={profile}
          today={today}
          onSaved={() => setIsOpen(false)}
        />
      </BottomSheet>
    </section>
  );
};

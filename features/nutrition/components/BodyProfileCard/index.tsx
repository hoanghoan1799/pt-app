"use client";

import { Activity, Pencil } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { BottomSheet } from "@/components/common/BottomSheet";
import { BUTTON_PRIMARY, CARD, ICON_BUTTON } from "@/constants/styles";
import { BodyProfileForm } from "@/features/nutrition/components/BodyProfileForm";
import { EnergyPlanSummary } from "@/features/nutrition/components/EnergyPlanSummary";
import {
  ACTIVITY_LEVELS,
  GOALS,
  SEX_LABEL_KEYS,
} from "@/features/nutrition/constants/energy";
import type {
  BodyProfile,
  BodyProfileEditor,
} from "@/features/nutrition/types/nutrition";
import {
  calculateEnergyPlan,
  formatDecimal,
  getGoal,
} from "@/features/nutrition/utils/energy";

interface BodyProfileCardProps {
  editor: BodyProfileEditor;
  userId?: number;
  profile: BodyProfile | null;
  isTargetManual: boolean;
  today: string;
}

// Copy is keyed under bodyProfileCard (translated at render).
const COPY = {
  admin: {
    title: "admin.title",
    empty: "admin.empty",
    action: "admin.action",
    sheetTitle: "admin.sheetTitle",
  },
  user: {
    title: "user.title",
    empty: "user.empty",
    action: "user.action",
    sheetTitle: "user.sheetTitle",
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
  const locale = useLocale();
  const t = useTranslations("nutrition.bodyProfileCard");
  const tLabels = useTranslations("nutrition.labels");
  const copy = COPY[editor];

  return (
    <section className={`${CARD} p-4`}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-muted">
            <Activity className="size-4" aria-hidden />
            {t(copy.title)}
          </p>
          {profile && plan && (
            <p className="mt-1 text-sm text-fg">
              {t("summary", {
                sex: tLabels(SEX_LABEL_KEYS[profile.sex]),
                age: plan.age,
                height: formatDecimal(profile.heightCm, locale),
                weight: formatDecimal(profile.weightKg, locale),
              })}
              <span className="block text-xs text-muted">
                {t("activityGoal", {
                  activity: tLabels(
                    ACTIVITY_LEVELS[profile.activityLevel].labelKey,
                  ).toLowerCase(),
                  goal: tLabels(GOALS[getGoal(profile)].labelKey).toLowerCase(),
                })}
              </span>
            </p>
          )}
        </div>
        {profile && (
          <button
            type="button"
            onClick={() => setIsOpen(true)}
            className={`${ICON_BUTTON} -mt-2 -mr-2 text-fg`}
            aria-label={t("editStats")}
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
        title={t(copy.sheetTitle)}
        description={t("sheetDescription")}
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

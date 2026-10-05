import clsx from "clsx";
import { Calculator } from "lucide-react";
import type { FormEvent } from "react";

import { SubmitButton } from "@/components/common/SubmitButton";
import { BUTTON_PRIMARY, FIELD_ERROR, INPUT, LABEL } from "@/constants/styles";
import { EnergyPlanSummary } from "@/features/nutrition/components/EnergyPlanSummary";
import {
  ACTIVITY_LEVEL_ORDER,
  ACTIVITY_LEVELS,
  GOAL_ORDER,
  GOALS,
  SEX_LABELS,
} from "@/features/nutrition/constants/energy";
import type { EnergyPlan, Sex } from "@/features/nutrition/types/nutrition";
import type { BodyProfileDraft } from "@/features/nutrition/utils/energy";

interface BodyProfileFormViewProps {
  userId: number;
  draft: BodyProfileDraft;
  plan: EnergyPlan | null;
  isPending: boolean;
  fieldErrors: Partial<Record<string, string>>;
  onChange: <Key extends keyof BodyProfileDraft>(
    key: Key,
    value: BodyProfileDraft[Key],
  ) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

const SEGMENT = "min-h-10 rounded-lg text-sm font-semibold transition";
const SEGMENT_ACTIVE = "bg-surface text-fg shadow-sm";

const NUMBER_FIELDS = [
  {
    key: "age",
    label: "Tuổi",
    unit: "tuổi",
    placeholder: "30",
    inputMode: "numeric",
  },
  {
    key: "heightCm",
    label: "Cao",
    unit: "cm",
    placeholder: "170",
    inputMode: "decimal",
  },
  {
    key: "weightKg",
    label: "Nặng",
    unit: "kg",
    placeholder: "65",
    inputMode: "decimal",
  },
] as const;

export const BodyProfileFormView = ({
  userId,
  draft,
  plan,
  isPending,
  fieldErrors,
  onChange,
  onSubmit,
}: BodyProfileFormViewProps) => (
  <form onSubmit={onSubmit} className="space-y-5" noValidate>
    <input type="hidden" name="userId" value={userId} />
    <input type="hidden" name="sex" value={draft.sex} />
    <input type="hidden" name="goal" value={draft.goal} />

    <fieldset>
      <legend className={LABEL}>Giới tính</legend>
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-line/60 p-1">
        {(["male", "female"] as Sex[]).map((sex) => (
          <button
            key={sex}
            type="button"
            onClick={() => onChange("sex", sex)}
            aria-pressed={draft.sex === sex}
            className={clsx(
              SEGMENT,
              draft.sex === sex ? SEGMENT_ACTIVE : "text-muted",
            )}
          >
            {SEX_LABELS[sex]}
          </button>
        ))}
      </div>
    </fieldset>

    <div className="grid grid-cols-3 gap-2">
      {NUMBER_FIELDS.map((field) => (
        <div key={field.key}>
          <label htmlFor={field.key} className={LABEL}>
            {field.label}
          </label>
          <div className="relative">
            <input
              id={field.key}
              name={field.key}
              value={draft[field.key]}
              onChange={(event) => onChange(field.key, event.target.value)}
              inputMode={field.inputMode}
              placeholder={field.placeholder}
              aria-invalid={Boolean(fieldErrors[field.key])}
              className={`${INPUT} px-3 pr-10`}
            />
            <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-muted">
              {field.unit}
            </span>
          </div>
        </div>
      ))}
    </div>
    {NUMBER_FIELDS.map(
      (field) =>
        fieldErrors[field.key] && (
          <p key={field.key} className={`${FIELD_ERROR} -mt-3`}>
            {fieldErrors[field.key]}
          </p>
        ),
    )}

    <fieldset>
      <legend className={LABEL}>Mức vận động</legend>
      <div className="space-y-1.5">
        {ACTIVITY_LEVEL_ORDER.map((level) => (
          <label
            key={level}
            className={clsx(
              "flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 transition",
              draft.activityLevel === level
                ? "border-accent bg-accent/10"
                : "border-line bg-surface",
            )}
          >
            <input
              type="radio"
              name="activityLevel"
              value={level}
              checked={draft.activityLevel === level}
              onChange={() => onChange("activityLevel", level)}
              className="size-4 accent-[var(--accent)]"
            />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-fg">
                {ACTIVITY_LEVELS[level].label}
              </span>
              <span className="block text-xs text-muted">
                {ACTIVITY_LEVELS[level].description}
              </span>
            </span>
            <span className="text-xs text-muted tabular-nums">
              ×{ACTIVITY_LEVELS[level].factor}
            </span>
          </label>
        ))}
      </div>
    </fieldset>

    <fieldset>
      <legend className={LABEL}>Mục tiêu</legend>
      <div className="grid grid-cols-3 gap-1 rounded-xl bg-line/60 p-1">
        {GOAL_ORDER.map((goal) => (
          <button
            key={goal}
            type="button"
            onClick={() => onChange("goal", goal)}
            aria-pressed={draft.goal === goal}
            className={clsx(
              SEGMENT,
              draft.goal === goal ? SEGMENT_ACTIVE : "text-muted",
            )}
          >
            {GOALS[goal].label}
          </button>
        ))}
      </div>
    </fieldset>

    <div className="rounded-2xl border border-line bg-surface p-4">
      <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold text-muted">
        <Calculator className="size-4" aria-hidden />
        Kết quả tính
      </p>
      {plan ? (
        <EnergyPlanSummary plan={plan} />
      ) : (
        <p className="text-sm text-muted">
          Nhập tuổi, chiều cao, cân nặng để xem TDEE.
        </p>
      )}
    </div>

    <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl bg-line/60 px-3">
      <input
        type="checkbox"
        name="applyToTarget"
        defaultChecked
        className="size-5 accent-[var(--accent)]"
      />
      <span className="text-sm text-fg">
        Cập nhật mục tiêu dinh dưỡng theo kết quả này (từ hôm nay)
      </span>
    </label>

    <SubmitButton className={`${BUTTON_PRIMARY} w-full`} isPending={isPending}>
      Lưu chỉ số
    </SubmitButton>
  </form>
);

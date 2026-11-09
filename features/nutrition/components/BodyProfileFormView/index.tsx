import clsx from "clsx";
import { Calculator } from "lucide-react";
import { useTranslations } from "next-intl";
import type { FormEvent } from "react";

import { Input } from "@/components/common/Input";
import { SubmitButton } from "@/components/common/SubmitButton";
import { BUTTON_PRIMARY, FIELD_ERROR, LABEL } from "@/constants/styles";
import { EnergyPlanSummary } from "@/features/nutrition/components/EnergyPlanSummary";
import {
  ACTIVITY_LEVEL_ORDER,
  ACTIVITY_LEVELS,
  GOAL_ORDER,
  GOALS,
  PROTEIN_PER_KG_DEFAULT,
  SEX_LABEL_KEYS,
} from "@/features/nutrition/constants/energy";
import type {
  BodyProfileEditor,
  EnergyPlan,
  Sex,
} from "@/features/nutrition/types/nutrition";
import type { BodyProfileDraft } from "@/features/nutrition/utils/energy";

interface BodyProfileFormViewProps {
  editor: BodyProfileEditor;
  // The member being edited; only sent by the admin form.
  userId?: number;
  isTargetManual: boolean;
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

// Labels and units are keys under bodyProfileFormView (translated at render).
const NUMBER_FIELDS = [
  {
    key: "age",
    labelKey: "fields.age",
    unitKey: "units.years",
    placeholder: "30",
    inputMode: "numeric",
  },
  {
    key: "heightCm",
    labelKey: "fields.height",
    unitKey: "units.cm",
    placeholder: "170",
    inputMode: "decimal",
  },
  {
    key: "weightKg",
    labelKey: "fields.weight",
    unitKey: "units.kg",
    placeholder: "65",
    inputMode: "decimal",
  },
] as const;

const ENERGY_FIELDS = [
  {
    key: "kcalAdjustment",
    labelKey: "fields.kcalAdjustment",
    unitKey: "units.kcal",
    placeholder: "-200",
    inputMode: "text",
  },
  {
    key: "proteinPerKg",
    labelKey: "fields.proteinPerKg",
    unitKey: "units.gPerKg",
    placeholder: "2",
    inputMode: "decimal",
  },
] as const;

export const BodyProfileFormView = ({
  editor,
  userId,
  isTargetManual,
  draft,
  plan,
  isPending,
  fieldErrors,
  onChange,
  onSubmit,
}: BodyProfileFormViewProps) => {
  const t = useTranslations("nutrition.bodyProfileFormView");
  const tLabels = useTranslations("nutrition.labels");

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      {editor === "admin" && (
        <input type="hidden" name="userId" value={userId} />
      )}
      <input type="hidden" name="sex" value={draft.sex} />
      {editor === "user" && (
        <input type="hidden" name="goal" value={draft.goal} />
      )}

      <fieldset>
        <legend className={LABEL}>{t("sex")}</legend>
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
              {tLabels(SEX_LABEL_KEYS[sex])}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="grid grid-cols-3 gap-2">
        {NUMBER_FIELDS.map((field) => (
          <div key={field.key}>
            <label htmlFor={field.key} className={LABEL}>
              {t(field.labelKey)}
            </label>
            <div className="relative">
              <Input
                id={field.key}
                name={field.key}
                value={draft[field.key]}
                onChange={(event) => onChange(field.key, event.target.value)}
                inputMode={field.inputMode}
                placeholder={field.placeholder}
                aria-invalid={Boolean(fieldErrors[field.key])}
                className="pl-3 pr-10"
              />
              <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-muted">
                {t(field.unitKey)}
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
        <legend className={LABEL}>{t("activityLegend")}</legend>
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
                  {tLabels(ACTIVITY_LEVELS[level].labelKey)}
                </span>
                <span className="block text-xs text-muted">
                  {tLabels(ACTIVITY_LEVELS[level].descriptionKey)}
                </span>
              </span>
              <span className="text-xs text-muted tabular-nums">
                ×{ACTIVITY_LEVELS[level].factor}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {editor === "admin" && (
        <div className="grid grid-cols-2 gap-2">
          {ENERGY_FIELDS.map((field) => (
            <div key={field.key}>
              <label htmlFor={field.key} className={LABEL}>
                {t(field.labelKey)}
              </label>
              <div className="relative">
                <Input
                  id={field.key}
                  name={field.key}
                  value={draft[field.key]}
                  onChange={(event) => onChange(field.key, event.target.value)}
                  inputMode={field.inputMode}
                  placeholder={field.placeholder}
                  aria-invalid={Boolean(fieldErrors[field.key])}
                  className="pl-3 pr-16"
                />
                <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-muted">
                  {t(field.unitKey)}
                </span>
              </div>
              {fieldErrors[field.key] ? (
                <p className={FIELD_ERROR}>{fieldErrors[field.key]}</p>
              ) : (
                <p className="mt-1 text-xs text-muted">
                  {field.key === "proteinPerKg"
                    ? t("proteinDefault", {
                        value: PROTEIN_PER_KG_DEFAULT[draft.sex]
                          .toFixed(1)
                          .replace(".", ","),
                      })
                    : t("kcalHint")}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {editor === "user" && draft.kcalAdjustment === "" && (
        <fieldset>
          <legend className={LABEL}>{t("goal")}</legend>
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
                {tLabels(GOALS[goal].labelKey)}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      <div className="rounded-2xl border border-line bg-surface p-4">
        <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold text-muted">
          <Calculator className="size-4" aria-hidden />
          {t("result")}
        </p>
        {plan ? (
          <EnergyPlanSummary plan={plan} />
        ) : (
          <p className="text-sm text-muted">{t("enterStats")}</p>
        )}
      </div>

      {editor === "admin" ? (
        <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl bg-line/60 px-3">
          <input
            type="checkbox"
            name="applyToTarget"
            defaultChecked
            className="size-5 accent-[var(--accent)]"
          />
          <span className="text-sm text-fg">{t("applyToTarget")}</span>
        </label>
      ) : (
        <p className="rounded-xl bg-line/60 px-3 py-2.5 text-sm text-muted">
          {isTargetManual ? t("targetManual") : t("targetRecalculated")}
        </p>
      )}

      <SubmitButton
        className={`${BUTTON_PRIMARY} w-full`}
        isPending={isPending}
      >
        {t("save")}
      </SubmitButton>
    </form>
  );
};

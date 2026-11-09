import clsx from "clsx";
import { TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ChangeEvent, FormEvent } from "react";

import { SubmitButton } from "@/components/common/SubmitButton";
import { BUTTON_PRIMARY, FIELD_ERROR, INPUT, LABEL } from "@/constants/styles";
import { FOOD_GROUP_VALUES } from "@/features/foods/constants/food-groups";
import {
  FOOD_GROUPS,
  FOOD_LIMITS,
  FOOD_STATE_LABELS,
} from "@/features/foods/constants/foods";
import type { Food } from "@/features/foods/types/food";
import { MACRO_LABELS } from "@/features/nutrition/constants/nutrition";

interface KcalCheck {
  fromMacros: string;
  isGapTooLarge: boolean;
  warning: string;
}

interface FoodFormViewProps {
  food: Food | null;
  values: Record<"kcal" | "protein" | "carbs" | "fat", string>;
  onNumberChange: Record<
    "kcal" | "protein" | "carbs" | "fat",
    (value: string) => void
  >;
  kcalCheck: KcalCheck | null;
  isConfirmed: boolean;
  onConfirmedChange: (isConfirmed: boolean) => void;
  isPending: boolean;
  fieldErrors: Partial<Record<string, string>>;
  formError?: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

interface NumberFieldProps {
  name: string;
  label: string;
  unit: string;
  error?: string;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
}

const NumberField = ({
  name,
  label,
  unit,
  error,
  value,
  defaultValue,
  onValueChange,
}: NumberFieldProps) => (
  <div>
    <label htmlFor={`food-${name}`} className={LABEL}>
      {label}
    </label>
    <div className="relative">
      <input
        id={`food-${name}`}
        name={name}
        {...(value === undefined ? { defaultValue } : { value })}
        onChange={
          onValueChange
            ? (event: ChangeEvent<HTMLInputElement>) =>
                onValueChange(event.target.value)
            : undefined
        }
        inputMode="decimal"
        autoComplete="off"
        aria-invalid={Boolean(error)}
        className={`${INPUT} pr-14`}
      />
      <span className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-sm text-muted">
        {unit}
      </span>
    </div>
    {error && <p className={FIELD_ERROR}>{error}</p>}
  </div>
);

export const FoodFormView = ({
  food,
  values,
  onNumberChange,
  kcalCheck,
  isConfirmed,
  onConfirmedChange,
  isPending,
  fieldErrors,
  formError,
  onSubmit,
}: FoodFormViewProps) => {
  const t = useTranslations("foods.foodFormView");
  const tLabels = useTranslations("foods.labels");
  const tNutritionLabels = useTranslations("nutrition.labels");
  const isWarningShown = Boolean(kcalCheck?.isGapTooLarge);
  // The live warning already explains a gap error from the server.
  const kcalError = isWarningShown ? undefined : fieldErrors.kcal;
  const isConfirmMissing = isWarningShown && Boolean(fieldErrors.kcal);

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {food && <input type="hidden" name="id" value={food.id} />}

      <div>
        <label htmlFor="food-name" className={LABEL}>
          {t("name")}
        </label>
        <input
          id="food-name"
          name="name"
          defaultValue={food?.name}
          maxLength={FOOD_LIMITS.NAME_MAX}
          placeholder={t("namePlaceholder")}
          autoComplete="off"
          aria-invalid={Boolean(fieldErrors.name)}
          className={INPUT}
        />
        {fieldErrors.name && <p className={FIELD_ERROR}>{fieldErrors.name}</p>}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="food-group" className={LABEL}>
            {t("group")}
          </label>
          <select
            id="food-group"
            name="group"
            defaultValue={food?.group ?? "meat"}
            aria-invalid={Boolean(fieldErrors.group)}
            className={INPUT}
          >
            {FOOD_GROUP_VALUES.map((group) => (
              <option key={group} value={group}>
                {tLabels(FOOD_GROUPS[group].labelKey)}
              </option>
            ))}
          </select>
          {fieldErrors.group && (
            <p className={FIELD_ERROR}>{fieldErrors.group}</p>
          )}
        </div>
        <div>
          <label htmlFor="food-state" className={LABEL}>
            {t("state")}
          </label>
          <select
            id="food-state"
            name="state"
            defaultValue={food?.state ?? ""}
            aria-invalid={Boolean(fieldErrors.state)}
            className={INPUT}
          >
            <option value="">{t("notApplicable")}</option>
            <option value="raw">{tLabels(FOOD_STATE_LABELS.raw)}</option>
            <option value="cooked">{tLabels(FOOD_STATE_LABELS.cooked)}</option>
          </select>
          {fieldErrors.state && (
            <p className={FIELD_ERROR}>{fieldErrors.state}</p>
          )}
        </div>
      </div>

      <fieldset className="space-y-3">
        <legend className={LABEL}>{t("valuesLegend")}</legend>
        <NumberField
          name="kcal"
          label={t("kcal")}
          unit="kcal"
          value={values.kcal}
          onValueChange={onNumberChange.kcal}
          error={kcalError}
        />
        <div className="grid grid-cols-3 gap-2">
          <NumberField
            name="protein"
            label={tNutritionLabels(MACRO_LABELS.protein.nameKey)}
            unit="g"
            value={values.protein}
            onValueChange={onNumberChange.protein}
            error={fieldErrors.protein}
          />
          <NumberField
            name="carbs"
            label={tNutritionLabels(MACRO_LABELS.carbs.nameKey)}
            unit="g"
            value={values.carbs}
            onValueChange={onNumberChange.carbs}
            error={fieldErrors.carbs}
          />
          <NumberField
            name="fat"
            label={tNutritionLabels(MACRO_LABELS.fat.nameKey)}
            unit="g"
            value={values.fat}
            onValueChange={onNumberChange.fat}
            error={fieldErrors.fat}
          />
        </div>
        <NumberField
          name="fiber"
          label={t("fiber")}
          unit="g"
          defaultValue={food?.fiber === null ? "" : String(food?.fiber ?? "")}
          error={fieldErrors.fiber}
        />
      </fieldset>

      {kcalCheck && (
        <div
          className={clsx(
            "space-y-3 rounded-xl border p-3 text-sm",
            isWarningShown
              ? "border-warning/50 bg-warning/10"
              : "border-line bg-surface",
          )}
        >
          <p
            className={clsx(
              "flex items-start gap-2",
              isWarningShown ? "font-medium text-warning" : "text-muted",
            )}
          >
            {isWarningShown && (
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            )}
            <span>
              {isWarningShown
                ? kcalCheck.warning
                : t("kcalMatches", { kcal: kcalCheck.fromMacros })}
            </span>
          </p>
          {isWarningShown && (
            <label
              className={clsx(
                "flex min-h-11 items-center gap-3 font-medium",
                isConfirmMissing ? "text-danger" : "text-fg",
              )}
            >
              <input
                type="checkbox"
                name="confirmed"
                checked={isConfirmed}
                onChange={(event) => onConfirmedChange(event.target.checked)}
                className="size-5 accent-accent"
              />
              {t("confirmLabel")}
            </label>
          )}
        </div>
      )}

      <fieldset className="space-y-3">
        <legend className={LABEL}>{t("serving")}</legend>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="food-servingLabel" className="sr-only">
              {t("servingName")}
            </label>
            <input
              id="food-servingLabel"
              name="servingLabel"
              defaultValue={food?.servingLabel ?? ""}
              maxLength={FOOD_LIMITS.SERVING_LABEL_MAX}
              placeholder={t("servingNamePlaceholder")}
              autoComplete="off"
              aria-invalid={Boolean(fieldErrors.servingLabel)}
              className={INPUT}
            />
            {fieldErrors.servingLabel && (
              <p className={FIELD_ERROR}>{fieldErrors.servingLabel}</p>
            )}
          </div>
          <div>
            <label htmlFor="food-servingGrams" className="sr-only">
              {t("servingWeight")}
            </label>
            <div className="relative">
              <input
                id="food-servingGrams"
                name="servingGrams"
                defaultValue={
                  food?.servingGrams === null
                    ? ""
                    : String(food?.servingGrams ?? "")
                }
                inputMode="decimal"
                placeholder={t("servingWeightPlaceholder")}
                autoComplete="off"
                aria-invalid={Boolean(fieldErrors.servingGrams)}
                className={`${INPUT} pr-10`}
              />
              <span className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-sm text-muted">
                g
              </span>
            </div>
            {fieldErrors.servingGrams && (
              <p className={FIELD_ERROR}>{fieldErrors.servingGrams}</p>
            )}
          </div>
        </div>
      </fieldset>

      <div>
        <label htmlFor="food-source" className={LABEL}>
          {t("source")}
        </label>
        <input
          id="food-source"
          name="source"
          defaultValue={food?.source ?? ""}
          maxLength={FOOD_LIMITS.SOURCE_MAX}
          placeholder={t("sourcePlaceholder")}
          autoComplete="off"
          aria-invalid={Boolean(fieldErrors.source)}
          className={INPUT}
        />
        {fieldErrors.source && (
          <p className={FIELD_ERROR}>{fieldErrors.source}</p>
        )}
      </div>

      {formError && (
        <p role="alert" className={FIELD_ERROR}>
          {formError}
        </p>
      )}

      <SubmitButton
        className={`${BUTTON_PRIMARY} w-full`}
        isPending={isPending}
      >
        {food ? t("saveChanges") : t("addFood")}
      </SubmitButton>
    </form>
  );
};

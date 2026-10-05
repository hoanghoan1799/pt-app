import clsx from "clsx";
import type { FormEvent } from "react";

import { SubmitButton } from "@/components/common/SubmitButton";
import {
  BUTTON_PRIMARY,
  FIELD_ERROR,
  INPUT,
  LABEL,
  TEXTAREA,
} from "@/constants/styles";
import {
  MACRO_COLORS,
  MACRO_LABELS,
  MACROS,
  MEAL_SHORT_LABELS,
  MEALS,
  NUTRITION_LIMITS,
} from "@/features/nutrition/constants/nutrition";
import type { FoodEntry, Meal } from "@/features/nutrition/types/nutrition";

interface FoodEntryFormViewProps {
  entry: FoodEntry | null;
  date: string;
  meal: Meal;
  isPending: boolean;
  fieldErrors: Partial<Record<string, string>>;
  formError?: string;
  onMealChange: (meal: Meal) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

export const FoodEntryFormView = ({
  entry,
  date,
  meal,
  isPending,
  fieldErrors,
  formError,
  onMealChange,
  onSubmit,
}: FoodEntryFormViewProps) => (
  <form onSubmit={onSubmit} className="space-y-4" noValidate>
    <input type="hidden" name="entryId" value={entry?.id ?? ""} />
    <input type="hidden" name="date" value={date} />
    <input type="hidden" name="meal" value={meal} />

    <fieldset>
      <legend className={LABEL}>Bữa</legend>
      <div className="grid grid-cols-4 gap-1 rounded-xl bg-line/60 p-1">
        {MEALS.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => onMealChange(item)}
            aria-pressed={meal === item}
            className={clsx(
              "min-h-10 rounded-lg text-sm font-semibold transition",
              meal === item ? "bg-surface text-fg shadow-sm" : "text-muted",
            )}
          >
            {MEAL_SHORT_LABELS[item]}
          </button>
        ))}
      </div>
    </fieldset>

    <div>
      <label htmlFor="description" className={LABEL}>
        Đã ăn gì?
      </label>
      <textarea
        id="description"
        name="description"
        defaultValue={entry?.description}
        rows={2}
        maxLength={NUTRITION_LIMITS.DESCRIPTION}
        placeholder="VD: 1 bát cơm, ức gà luộc, rau muống xào"
        className={TEXTAREA}
      />
    </div>

    <div>
      <p className={LABEL}>Ước lượng (gram, không bắt buộc)</p>
      <div className="grid grid-cols-3 gap-2">
        {MACROS.map((macro) => (
          <div key={macro}>
            <label
              htmlFor={macro}
              className={clsx(
                "mb-1 block text-xs font-semibold",
                MACRO_COLORS[macro].text,
              )}
            >
              {MACRO_LABELS[macro].name}
            </label>
            <div className="relative">
              <input
                id={macro}
                name={macro}
                defaultValue={entry?.[macro] ?? ""}
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder="0"
                aria-invalid={Boolean(fieldErrors[macro])}
                className={`${INPUT} pr-8`}
              />
              <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted">
                g
              </span>
            </div>
          </div>
        ))}
      </div>
      {MACROS.map(
        (macro) =>
          fieldErrors[macro] && (
            <p key={macro} className={FIELD_ERROR}>
              {MACRO_LABELS[macro].name}: {fieldErrors[macro]}
            </p>
          ),
      )}
      <p className="mt-1.5 text-xs text-muted">
        Carb: {MACRO_LABELS.carbs.foods} · Protein: {MACRO_LABELS.protein.foods}{" "}
        · Fat: {MACRO_LABELS.fat.foods}
      </p>
    </div>

    {formError && (
      <p role="alert" className={FIELD_ERROR}>
        {formError}
      </p>
    )}

    <SubmitButton className={`${BUTTON_PRIMARY} w-full`} isPending={isPending}>
      {entry ? "Lưu thay đổi" : "Ghi bữa ăn"}
    </SubmitButton>
  </form>
);

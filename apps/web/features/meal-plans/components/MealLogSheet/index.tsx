"use client";

import { MEAL_LOG_LIMITS } from "@pt/contracts";
import { ArrowLeft, PencilLine, Plus, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import type { FormEvent } from "react";

import { BottomSheet } from "@/components/common/BottomSheet";
import { Input } from "@/components/common/Input";
import { SubmitButton } from "@/components/common/SubmitButton";
import {
  BUTTON_PRIMARY,
  BUTTON_SECONDARY,
  FIELD_ERROR,
  INPUT,
  LABEL,
} from "@/constants/styles";
import {
  FOOD_GROUPS,
  FOOD_STATE_LABELS,
} from "@/features/foods/constants/foods";
import { useMealLogSheet } from "@/features/meal-plans/hooks/use-meal-log-sheet";
import type { MealLog } from "@/features/meal-plans/types/meal-log";
import type { PlanFood } from "@/features/meal-plans/types/meal-plan";

interface MealLogSheetProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  mealId: number;
  mealName: string;
  library: PlanFood[];
  // The log being edited; null adds a new one.
  editing: MealLog | null;
}

// Labels are keys under mealPlans.mealLogSheet (translated at render).
const MACRO_INPUTS = [
  { field: "kcal", labelKey: "macroInputs.kcal" },
  { field: "protein", labelKey: "macroInputs.protein" },
  { field: "carbs", labelKey: "macroInputs.carbs" },
  { field: "fat", labelKey: "macroInputs.fat" },
] as const;

type BodyProps = Omit<MealLogSheetProps, "isOpen">;

// Remounted on every open (see below), so each open starts clean.
const MealLogSheetBody = ({
  onOpenChange,
  mealId,
  library,
  editing,
}: BodyProps) => {
  const t = useTranslations("mealPlans.mealLogSheet");
  const tFoods = useTranslations("foods.labels");
  const form = useMealLogSheet(mealId, library, editing, () =>
    onOpenChange(false),
  );

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    form.submit();
  };

  if (form.step === "search") {
    const { picker } = form;

    return (
      <div className="space-y-3">
        <label htmlFor="log-search" className="sr-only">
          {t("searchLabel")}
        </label>
        <Input
          id="log-search"
          type="search"
          clearable
          leadingIcon={<Search className="size-5" aria-hidden />}
          value={picker.query}
          onChange={(event) => picker.setQuery(event.target.value)}
          placeholder={t("searchPlaceholder")}
          autoComplete="off"
        />
        {picker.isSearching &&
          (picker.results.length ? (
            <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
              {picker.results.map((food) => (
                <li key={food.id}>
                  <button
                    type="button"
                    onClick={() => form.pick(food)}
                    className="flex min-h-12 w-full items-center gap-3 px-3 py-2 text-left transition active:bg-line"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] leading-snug text-fg">
                        {food.name}
                      </span>
                      <span className="block text-xs text-muted">
                        {tFoods(FOOD_GROUPS[food.group].labelKey)}
                        {food.state
                          ? ` · ${tFoods(FOOD_STATE_LABELS[food.state])}`
                          : ""}
                        {" · "}
                        {food.kcal} kcal/100 g
                      </span>
                    </span>
                    <Plus className="size-5 shrink-0 text-accent" aria-hidden />
                    <span className="sr-only">
                      {t("pickFood", { name: food.name })}
                    </span>
                  </button>
                </li>
              ))}
              {picker.hasMore && (
                <li className="px-3 py-2 text-xs text-muted">
                  {t("moreResults")}
                </li>
              )}
            </ul>
          ) : (
            <p className="px-1 text-sm text-muted">{t("noResults")}</p>
          ))}
        <button
          type="button"
          onClick={() => form.goTo("free")}
          className={`${BUTTON_SECONDARY} w-full border-dashed`}
        >
          <PencilLine className="size-5" aria-hidden />
          {t("freeFood")}
        </button>
      </div>
    );
  }

  if (form.step === "amount") {
    const name = form.food?.name ?? editing?.name ?? "";

    return (
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <p className="text-[15px] font-medium text-fg">{name}</p>
        <div>
          <label htmlFor="log-grams" className={LABEL}>
            {t("grams")}
          </label>
          <input
            id="log-grams"
            value={form.gramsText}
            onChange={(event) => form.setGramsText(event.target.value)}
            inputMode="decimal"
            autoFocus
            className={INPUT}
          />
          {form.error && <p className={FIELD_ERROR}>{form.error}</p>}
        </div>
        <div className="grid grid-cols-1 gap-2">
          <SubmitButton isPending={form.isPending} className={BUTTON_PRIMARY}>
            {editing ? t("save") : t("addFood")}
          </SubmitButton>
          {!editing && (
            <button
              type="button"
              onClick={() => form.goTo("search")}
              className={BUTTON_SECONDARY}
            >
              <ArrowLeft className="size-5" aria-hidden />
              {t("pickOther")}
            </button>
          )}
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <div>
        <label htmlFor="log-name" className={LABEL}>
          {t("name")}
        </label>
        <input
          id="log-name"
          value={form.name}
          onChange={(event) => form.setName(event.target.value)}
          maxLength={MEAL_LOG_LIMITS.CUSTOM_NAME}
          placeholder={t("namePlaceholder")}
          className={INPUT}
        />
      </div>
      <div>
        <label htmlFor="log-free-grams" className={LABEL}>
          {t("gramsOptional")}
        </label>
        <input
          id="log-free-grams"
          value={form.gramsText}
          onChange={(event) => form.setGramsText(event.target.value)}
          inputMode="decimal"
          className={INPUT}
        />
      </div>
      <fieldset className="space-y-3">
        <legend className="text-sm font-medium text-fg">
          {t("nutritionOptional")}
        </legend>
        <div className="grid grid-cols-2 gap-3">
          {MACRO_INPUTS.map(({ field, labelKey }) => (
            <div key={field}>
              <label htmlFor={`log-${field}`} className="sr-only">
                {t(labelKey)}
              </label>
              <input
                id={`log-${field}`}
                value={form.macros[field]}
                onChange={(event) => form.setMacro(field, event.target.value)}
                inputMode="decimal"
                placeholder={t(labelKey)}
                className={INPUT}
              />
            </div>
          ))}
        </div>
      </fieldset>
      {form.error && <p className={FIELD_ERROR}>{form.error}</p>}
      <div className="grid grid-cols-1 gap-2">
        <SubmitButton isPending={form.isPending} className={BUTTON_PRIMARY}>
          {editing ? t("save") : t("addFood")}
        </SubmitButton>
        {!editing && (
          <button
            type="button"
            onClick={() => form.goTo("search")}
            className={BUTTON_SECONDARY}
          >
            <ArrowLeft className="size-5" aria-hidden />
            {t("searchLibrary")}
          </button>
        )}
      </div>
    </form>
  );
};

// "Thêm món đã ăn" / "Sửa món": search the library (accent-free) and enter
// grams, or type a free food. Remounted per log so the fields start from it.
export const MealLogSheet = ({
  isOpen,
  onOpenChange,
  mealId,
  mealName,
  library,
  editing,
}: MealLogSheetProps) => {
  const t = useTranslations("mealPlans.mealLogSheet");

  return (
    <BottomSheet
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title={editing ? t("editTitle") : t("addTitle")}
      description={mealName}
    >
      <MealLogSheetBody
        key={editing?.id ?? "new"}
        onOpenChange={onOpenChange}
        mealId={mealId}
        mealName={mealName}
        library={library}
        editing={editing}
      />
    </BottomSheet>
  );
};

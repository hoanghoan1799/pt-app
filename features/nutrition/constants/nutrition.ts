import type {
  Macro,
  Meal,
  TargetSource,
} from "@/features/nutrition/types/nutrition";

export const MACROS: Macro[] = ["carbs", "protein", "fat"];

// Keys are relative to the nutrition.labels namespace (translated at render).
export const MACRO_LABELS = {
  carbs: { nameKey: "macro.carbs", foodsKey: "macroFoods.carbs", short: "C" },
  protein: {
    nameKey: "macro.protein",
    foodsKey: "macroFoods.protein",
    short: "P",
  },
  fat: { nameKey: "macro.fat", foodsKey: "macroFoods.fat", short: "F" },
} as const satisfies Record<
  Macro,
  { nameKey: string; foodsKey: string; short: string }
>;

// Tailwind classes per macro, backed by the --macro-* tokens in globals.css.
export const MACRO_COLORS: Record<
  Macro,
  { bar: string; text: string; soft: string; ring: string }
> = {
  carbs: {
    bar: "bg-macro-carbs",
    text: "text-macro-carbs",
    soft: "bg-macro-carbs/12",
    ring: "stroke-macro-carbs",
  },
  protein: {
    bar: "bg-macro-protein",
    text: "text-macro-protein",
    soft: "bg-macro-protein/12",
    ring: "stroke-macro-protein",
  },
  fat: {
    bar: "bg-macro-fat",
    text: "text-macro-fat",
    soft: "bg-macro-fat/12",
    ring: "stroke-macro-fat",
  },
};

export const MEALS: Meal[] = ["breakfast", "lunch", "dinner", "snack"];

export const MEAL_LABEL_KEYS = {
  breakfast: "meal.breakfast",
  lunch: "meal.lunch",
  dinner: "meal.dinner",
  snack: "meal.snack",
} as const satisfies Record<Meal, string>;

// Short labels for the meal picker.
export const MEAL_SHORT_LABEL_KEYS = {
  breakfast: "mealShort.breakfast",
  lunch: "mealShort.lunch",
  dinner: "mealShort.dinner",
  snack: "mealShort.snack",
} as const satisfies Record<Meal, string>;

export const NUTRITION_LIMITS = {
  MAX_GRAMS: 2000,
  DESCRIPTION: 300,
  NOTE: 1000,
} as const;

export const NUTRITION_MESSAGES = {
  INVALID_INPUT: "Vui lòng kiểm tra lại thông tin",
  TARGET_SAVED: "Đã lưu mục tiêu dinh dưỡng",
  PROFILE_SAVED: "Đã lưu chỉ số cơ thể",
  WEIGHT_SAVED: "Đã ghi cân nặng hôm nay",
  WEIGHT_SAVED_TARGET: "Đã ghi cân nặng và cập nhật mục tiêu theo TDEE",
  PROFILE_APPLIED: "Đã lưu chỉ số và cập nhật mục tiêu theo TDEE",
  PROFILE_KEPT_MANUAL:
    "Đã lưu chỉ số. PT đang đặt mục tiêu riêng nên mục tiêu giữ nguyên.",
  ENTRY_CREATED: "Đã ghi bữa ăn",
  ENTRY_UPDATED: "Đã cập nhật bữa ăn",
  ENTRY_EMPTY: "Nhập món đã ăn hoặc số gram",
  ENTRY_NOT_FOUND: "Bữa ăn không còn tồn tại",
  FUTURE_DATE: "Chưa tới ngày này",
} as const;

export const TARGET_SOURCE_LABEL_KEYS = {
  tdee: "targetSource.tdee",
  manual: "targetSource.manual",
} as const satisfies Record<TargetSource, string>;

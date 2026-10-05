import type {
  Macro,
  Meal,
  TargetSource,
} from "@/features/nutrition/types/nutrition";

export const MACROS: Macro[] = ["carbs", "protein", "fat"];

export const MACRO_LABELS: Record<
  Macro,
  { name: string; foods: string; short: string }
> = {
  carbs: { name: "Carb", foods: "cơm, bún, khoai, bánh mì", short: "C" },
  protein: { name: "Protein", foods: "thịt, cá, trứng, đậu", short: "P" },
  fat: { name: "Fat", foods: "dầu, mỡ, bơ, hạt", short: "F" },
};

// Tailwind classes per macro, backed by the --macro-* tokens in globals.css.
export const MACRO_COLORS: Record<
  Macro,
  { bar: string; text: string; soft: string }
> = {
  carbs: {
    bar: "bg-macro-carbs",
    text: "text-macro-carbs",
    soft: "bg-macro-carbs/12",
  },
  protein: {
    bar: "bg-macro-protein",
    text: "text-macro-protein",
    soft: "bg-macro-protein/12",
  },
  fat: { bar: "bg-macro-fat", text: "text-macro-fat", soft: "bg-macro-fat/12" },
};

export const MEALS: Meal[] = ["breakfast", "lunch", "dinner", "snack"];

export const MEAL_LABELS: Record<Meal, string> = {
  breakfast: "Bữa sáng",
  lunch: "Bữa trưa",
  dinner: "Bữa tối",
  snack: "Bữa phụ",
};

// Short labels for the meal picker.
export const MEAL_SHORT_LABELS: Record<Meal, string> = {
  breakfast: "Sáng",
  lunch: "Trưa",
  dinner: "Tối",
  snack: "Phụ",
};

export const GRAMS_PER_LANG = 100;

// Within ±10% of the target counts as "đạt".
export const TARGET_TOLERANCE = 0.1;

export const NUTRITION_LIMITS = {
  MAX_GRAMS: 2000,
  DESCRIPTION: 300,
  NOTE: 1000,
} as const;

export const NUTRITION_MESSAGES = {
  INVALID_INPUT: "Vui lòng kiểm tra lại thông tin",
  TARGET_SAVED: "Đã lưu mục tiêu dinh dưỡng",
  PROFILE_SAVED: "Đã lưu chỉ số cơ thể",
  PROFILE_APPLIED: "Đã lưu chỉ số và cập nhật mục tiêu theo TDEE",
  PROFILE_KEPT_MANUAL:
    "Đã lưu chỉ số. PT đang đặt mục tiêu riêng nên mục tiêu giữ nguyên.",
  ENTRY_CREATED: "Đã ghi bữa ăn",
  ENTRY_UPDATED: "Đã cập nhật bữa ăn",
  ENTRY_DELETED: "Đã xóa bữa ăn",
  ENTRY_EMPTY: "Nhập món đã ăn hoặc số gram",
  ENTRY_NOT_FOUND: "Bữa ăn không còn tồn tại",
  FUTURE_DATE: "Chưa tới ngày này",
  DELETE_CONFIRM: "Xóa bữa ăn này?",
} as const;

export const TARGET_SOURCE_LABELS: Record<TargetSource, string> = {
  tdee: "Tự tính từ TDEE",
  manual: "PT nhập tay",
};

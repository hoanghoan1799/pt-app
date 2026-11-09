import { z } from "zod";

import { FOOD_GROUP_VALUES } from "@/features/foods/constants/food-groups";
import { FOOD_LIMITS, FOOD_MESSAGES } from "@/features/foods/constants/foods";
import {
  describeKcalGap,
  isKcalGapTooLarge,
} from "@/features/foods/utils/food-math";
import { parseDecimal } from "@/utils/decimal";
import { normalizeName } from "@/utils/name";

// Accepts "3,6" as well as "3.6" (Vietnamese decimal comma). Empty, text and
// out of range values give a Vietnamese message on that field.
const numberField = (label: string, max: number) =>
  z
    .string()
    .trim()
    .min(1, `Nhập ${label}`)
    .transform((value, context) => {
      // parseDecimal reads no sign; say why a minus is refused.
      if (value.startsWith("-")) {
        context.addIssue({
          code: "custom",
          message: `${label} không được âm`,
        });
        return z.NEVER;
      }
      return parseDecimal(value);
    })
    .pipe(
      z
        .number({ error: `${label} phải là số` })
        .min(0, `${label} không được âm`)
        .max(max, `${label} tối đa ${max}`),
    );

const optionalNumberField = (label: string, max: number) =>
  z
    .string()
    .trim()
    .optional()
    .transform((value, context) => {
      if (!value) {
        return null;
      }

      const parsed = numberField(label, max).safeParse(value);

      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          context.addIssue({ code: "custom", message: issue.message });
        }
        return z.NEVER;
      }
      return parsed.data;
    });

const optionalText = (label: string, max: number) =>
  z
    .string()
    .optional()
    .transform((value) => normalizeName(value ?? ""))
    .pipe(z.string().max(max, `${label} tối đa ${max} ký tự`));

export const foodFormSchema = z
  .object({
    name: z
      .string()
      .transform(normalizeName)
      .pipe(
        z
          .string()
          .min(1, "Nhập tên món")
          .max(
            FOOD_LIMITS.NAME_MAX,
            `Tên tối đa ${FOOD_LIMITS.NAME_MAX} ký tự`,
          ),
      ),
    group: z.enum(FOOD_GROUP_VALUES, {
      error: "Chọn nhóm món",
    }),
    state: z
      .enum(["", "raw", "cooked"], { error: "Chọn trạng thái hợp lệ" })
      .optional()
      .transform((value) => (value ? value : null)),
    kcal: numberField("Calo", FOOD_LIMITS.MAX_KCAL_PER_100G),
    protein: numberField("Protein", FOOD_LIMITS.MAX_GRAMS_PER_100G),
    carbs: numberField("Carb", FOOD_LIMITS.MAX_GRAMS_PER_100G),
    fat: numberField("Fat", FOOD_LIMITS.MAX_GRAMS_PER_100G),
    fiber: optionalNumberField("Chất xơ", FOOD_LIMITS.MAX_GRAMS_PER_100G),
    servingLabel: optionalText("Tên khẩu phần", FOOD_LIMITS.SERVING_LABEL_MAX),
    servingGrams: optionalNumberField(
      "Khối lượng khẩu phần",
      FOOD_LIMITS.MAX_SERVING_GRAMS,
    ),
    nameEn: optionalText("Tên tiếng Anh", FOOD_LIMITS.NAME_MAX),
    nameZh: optionalText("Tên tiếng Trung", FOOD_LIMITS.NAME_MAX),
    source: optionalText("Nguồn", FOOD_LIMITS.SOURCE_MAX),
    // Checkbox: present ("on") when ticked.
    confirmed: z
      .string()
      .optional()
      .transform((value) => value === "on"),
  })
  .check((context) => {
    // Cross-field rules only make sense when every field is valid on its own.
    if (context.issues.length > 0) {
      return;
    }

    const food = context.value;
    const addIssue = (path: string, message: string) =>
      context.issues.push({
        code: "custom",
        path: [path],
        message,
        input: context.value,
      });

    if (food.protein + food.carbs + food.fat > FOOD_LIMITS.MAX_GRAMS_PER_100G) {
      addIssue("fat", "Protein + carb + fat không vượt quá 100 g trên 100 g");
    }

    const hasLabel = food.servingLabel !== "";
    const hasGrams = food.servingGrams !== null;

    if (hasLabel && !hasGrams) {
      addIssue("servingGrams", "Nhập khối lượng khẩu phần (gram)");
    }
    if (hasGrams && !hasLabel) {
      addIssue("servingLabel", "Nhập tên khẩu phần, ví dụ 1 tô");
    }
    if (hasGrams && food.servingGrams === 0) {
      addIssue("servingGrams", "Khối lượng khẩu phần phải lớn hơn 0");
    }

    if (!food.confirmed && isKcalGapTooLarge(food.kcal, food)) {
      addIssue(
        "kcal",
        `${describeKcalGap(food.kcal, food)} Kiểm tra lại hoặc tick "${FOOD_MESSAGES.CONFIRM_LABEL}".`,
      );
    }
  });

export type FoodFormValues = z.output<typeof foodFormSchema>;

export const foodIdSchema = z.coerce.number().int().positive();

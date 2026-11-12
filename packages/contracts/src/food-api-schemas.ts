import { FOOD_GROUP_VALUES } from "./food-groups.js";
import { foodFormSchema,type FoodFormValues } from "./food-schemas.js";
import {
  cursorPageSchema,
  cursorSchema,
  pageLimitSchema,
} from "./pagination.js";
import { z } from "zod";

export const FOOD_LOCALES = ["vi", "en", "zh"] as const;
export type FoodLocale = (typeof FOOD_LOCALES)[number];

export const FOOD_LIST_LIMIT = { DEFAULT: 50, MAX: 200 } as const;
export const FOOD_QUERY_MAX = 80;

// The web form posts text ("3,6"); a JSON client may send numbers. Both are
// turned into text and then go through the one food form schema, so the limits,
// messages and normalisation are the same for every client.
const numeric = (label: string) =>
  z
    .union([z.string(), z.number()], { error: `Nhập ${label}` })
    .transform(String);

const optionalNumeric = z
  .union([z.string(), z.number()])
  .nullish()
  .transform((value) => (value == null ? undefined : String(value)));

const optionalText = z
  .string()
  .nullish()
  .transform((value) => value ?? undefined);

export const foodRequestSchema = z
  .object({
    name: z.string({ error: "Nhập tên món" }),
    group: z.string({ error: "Chọn nhóm món" }),
    state: optionalText,
    kcal: numeric("Calo"),
    protein: numeric("Protein"),
    carbs: numeric("Carb"),
    fat: numeric("Fat"),
    fiber: optionalNumeric,
    servingLabel: optionalText,
    servingGrams: optionalNumeric,
    nameEn: optionalText,
    nameZh: optionalText,
    source: optionalText,
    // The "I checked the numbers" box: true / "on" skips the kcal gap check.
    confirmed: z
      .union([z.boolean(), z.string()])
      .nullish()
      .transform((value) =>
        value === true || value === "on" ? "on" : undefined,
      ),
  })
  // The object above only reshapes types; every rule lives in foodFormSchema.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- input is checked above
  .pipe(foodFormSchema as z.ZodType<FoodFormValues, any>);

export type FoodRequest = z.input<typeof foodRequestSchema>;

export const foodResponseSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  // Accent-free lower-cased name used by the search.
  nameKey: z.string(),
  nameEn: z.string().nullable(),
  nameZh: z.string().nullable(),
  group: z.enum(FOOD_GROUP_VALUES),
  state: z.enum(["raw", "cooked"]).nullable(),
  // Per 100 g.
  kcal: z.number(),
  protein: z.number(),
  carbs: z.number(),
  fat: z.number(),
  fiber: z.number().nullable(),
  servingLabel: z.string().nullable(),
  servingGrams: z.number().nullable(),
  source: z.string(),
});
export type FoodResponse = z.infer<typeof foodResponseSchema>;

export const foodListQuerySchema = z.object({
  // Accent- and case-insensitive; every word must appear in the name.
  q: z.string().trim().max(FOOD_QUERY_MAX).optional(),
  group: z.enum(FOOD_GROUP_VALUES).optional(),
  // Which translation `q` also searches (vi = the stored name only).
  locale: z.enum(FOOD_LOCALES).default("vi"),
  limit: pageLimitSchema(FOOD_LIST_LIMIT.DEFAULT, FOOD_LIST_LIMIT.MAX),
  cursor: cursorSchema.optional(),
});
export type FoodListQuery = z.infer<typeof foodListQuerySchema>;

export const foodListResponseSchema = cursorPageSchema(foodResponseSchema);
export type FoodListResponse = z.infer<typeof foodListResponseSchema>;

export const foodGroupsResponseSchema = z.object({
  // Only groups that have an active food, in the order of the group chips.
  groups: z.array(
    z.object({
      group: z.enum(FOOD_GROUP_VALUES),
      count: z.number().int().positive(),
    }),
  ),
});
export type FoodGroupsResponse = z.infer<typeof foodGroupsResponseSchema>;

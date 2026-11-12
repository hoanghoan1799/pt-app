import { toNameKey } from "@pt/contracts";

import { SEED_FOOD_TRANSLATIONS } from "@/features/foods/constants/food-translations";
import type { Food } from "@/features/foods/types/food";
import type { Locale } from "@/utils/locale";

type NamedFood = Pick<Food, "name" | "nameKey"> &
  Partial<Pick<Food, "nameEn" | "nameZh">>;

// The stored translation, else the starter food's; "" when there is none.
// Prefills the admin form (the raw `name` is not a translation).
export const translatedFoodName = (food: NamedFood, language: "en" | "zh") =>
  (language === "en" ? food.nameEn : food.nameZh)?.trim() ||
  SEED_FOOD_TRANSLATIONS[food.nameKey]?.[language] ||
  "";

// vi shows the stored name; en/zh show the PT's translation, else the starter
// food's, else the stored name (a food created without a translation).
export const localizeFoodName = (food: NamedFood, locale: Locale) => {
  if (locale === "vi") {
    return food.name;
  }

  return translatedFoodName(food, locale) || food.name;
};

interface UnitNames {
  one: string;
  many: string;
}

// Vietnamese household units to display words. Chinese has no plural and puts
// the number first without a space ("1个").
const UNITS: Record<string, { en: UnitNames; zh: string }> = {
  quả: { en: { one: "piece", many: "pieces" }, zh: "个" },
  trái: { en: { one: "piece", many: "pieces" }, zh: "个" },
  củ: { en: { one: "piece", many: "pieces" }, zh: "个" },
  cái: { en: { one: "piece", many: "pieces" }, zh: "个" },
  ly: { en: { one: "glass", many: "glasses" }, zh: "杯" },
  cốc: { en: { one: "cup", many: "cups" }, zh: "杯" },
  chén: { en: { one: "bowl", many: "bowls" }, zh: "碗" },
  tô: { en: { one: "large bowl", many: "large bowls" }, zh: "大碗" },
  thìa: { en: { one: "tbsp", many: "tbsp" }, zh: "勺" },
  muỗng: { en: { one: "tbsp", many: "tbsp" }, zh: "勺" },
  lon: { en: { one: "can", many: "cans" }, zh: "罐" },
  miếng: { en: { one: "piece", many: "pieces" }, zh: "块" },
  lát: { en: { one: "slice", many: "slices" }, zh: "片" },
  đĩa: { en: { one: "plate", many: "plates" }, zh: "盘" },
  hộp: { en: { one: "box", many: "boxes" }, zh: "盒" },
  gói: { en: { one: "pack", many: "packs" }, zh: "包" },
  hũ: { en: { one: "jar", many: "jars" }, zh: "罐" },
  chai: { en: { one: "bottle", many: "bottles" }, zh: "瓶" },
  nắm: { en: { one: "handful", many: "handfuls" }, zh: "把" },
  phần: { en: { one: "serving", many: "servings" }, zh: "份" },
};

const SERVING_PATTERN = /^(\d+(?:[.,]\d+)?)\s+(\S+)$/u;

// "1 quả" -> "1 piece" / "1个". Text that is not "<number> <known unit>" (a
// PT's own wording) is returned as typed.
export const localizeServingLabel = (label: string, locale: Locale) => {
  if (locale === "vi") {
    return label;
  }

  const match = SERVING_PATTERN.exec(label.trim());
  const unit = match ? UNITS[match[2].toLowerCase()] : undefined;

  if (!match || !unit) {
    return label;
  }

  const [, amount] = match;

  if (locale === "zh") {
    return `${amount}${unit.zh}`;
  }

  const isOne = Number(amount.replace(",", ".")) <= 1;

  return `${amount} ${isOne ? unit.en.one : unit.en.many}`;
};

// The food as the screens show it: localized name and serving label, plus a
// search key that covers the Vietnamese (accent-free) and the localized name.
export const localizeFood = <
  T extends NamedFood & { servingLabel?: string | null },
>(
  food: T,
  locale: Locale,
): T & { searchKey: string } => {
  const name = localizeFoodName(food, locale);

  return {
    ...food,
    name,
    ...(food.servingLabel
      ? { servingLabel: localizeServingLabel(food.servingLabel, locale) }
      : {}),
    searchKey:
      locale === "vi" ? food.nameKey : `${food.nameKey} ${toNameKey(name)}`,
  } as T & { searchKey: string };
};

// Localizes a list and sorts it by the localized name.
export const localizeFoods = <
  T extends NamedFood & { servingLabel?: string | null },
>(
  foods: T[],
  locale: Locale,
) =>
  foods
    .map((food) => localizeFood(food, locale))
    .sort((a, b) => a.name.localeCompare(b.name, locale));

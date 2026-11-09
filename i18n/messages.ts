import enAuth from "@/messages/en/auth.json";
import enAvatar from "@/messages/en/avatar.json";
import enCommon from "@/messages/en/common.json";
import enFoods from "@/messages/en/foods.json";
import enLayout from "@/messages/en/layout.json";
import enMealPlans from "@/messages/en/mealPlans.json";
import enNutrition from "@/messages/en/nutrition.json";
import enPages from "@/messages/en/pages.json";
import enPwa from "@/messages/en/pwa.json";
import enWorkouts from "@/messages/en/workouts.json";
import viAuth from "@/messages/vi/auth.json";
import viAvatar from "@/messages/vi/avatar.json";
import viCommon from "@/messages/vi/common.json";
import viFoods from "@/messages/vi/foods.json";
import viLayout from "@/messages/vi/layout.json";
import viMealPlans from "@/messages/vi/mealPlans.json";
import viNutrition from "@/messages/vi/nutrition.json";
import viPages from "@/messages/vi/pages.json";
import viPwa from "@/messages/vi/pwa.json";
import viWorkouts from "@/messages/vi/workouts.json";
import type { Locale } from "@/utils/locale";

// One object per locale, keyed by namespace. Files are imported statically (no
// dynamic fs) so they bundle on every runtime. Add a namespace here and in
// both messages/<locale>/ folders; i18n/__tests__/messages.test.ts checks them.
export const MESSAGES = {
  vi: {
    auth: viAuth,
    avatar: viAvatar,
    common: viCommon,
    foods: viFoods,
    layout: viLayout,
    mealPlans: viMealPlans,
    nutrition: viNutrition,
    pages: viPages,
    pwa: viPwa,
    workouts: viWorkouts,
  },
  en: {
    auth: enAuth,
    avatar: enAvatar,
    common: enCommon,
    foods: enFoods,
    layout: enLayout,
    mealPlans: enMealPlans,
    nutrition: enNutrition,
    pages: enPages,
    pwa: enPwa,
    workouts: enWorkouts,
  },
} as const satisfies Record<Locale, Record<string, object>>;

export const viMessages = MESSAGES.vi;

export const getMessages = (locale: Locale) => MESSAGES[locale];

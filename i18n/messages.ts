import enAdminPages from "@/messages/en/adminPages.json";
import enAuth from "@/messages/en/auth.json";
import enAvatar from "@/messages/en/avatar.json";
import enCommon from "@/messages/en/common.json";
import enDashboard from "@/messages/en/dashboard.json";
import enFoods from "@/messages/en/foods.json";
import enLayout from "@/messages/en/layout.json";
import enMealPlans from "@/messages/en/mealPlans.json";
import enMembers from "@/messages/en/members.json";
import enNutrition from "@/messages/en/nutrition.json";
import enPages from "@/messages/en/pages.json";
import enPts from "@/messages/en/pts.json";
import enPwa from "@/messages/en/pwa.json";
import enWorkouts from "@/messages/en/workouts.json";
import viAdminPages from "@/messages/vi/adminPages.json";
import viAuth from "@/messages/vi/auth.json";
import viAvatar from "@/messages/vi/avatar.json";
import viCommon from "@/messages/vi/common.json";
import viDashboard from "@/messages/vi/dashboard.json";
import viFoods from "@/messages/vi/foods.json";
import viLayout from "@/messages/vi/layout.json";
import viMealPlans from "@/messages/vi/mealPlans.json";
import viMembers from "@/messages/vi/members.json";
import viNutrition from "@/messages/vi/nutrition.json";
import viPages from "@/messages/vi/pages.json";
import viPts from "@/messages/vi/pts.json";
import viPwa from "@/messages/vi/pwa.json";
import viWorkouts from "@/messages/vi/workouts.json";
import type { Locale } from "@/utils/locale";

// One object per locale, keyed by namespace. Files are imported statically (no
// dynamic fs) so they bundle on every runtime. Add a namespace here and in
// both messages/<locale>/ folders; i18n/__tests__/messages.test.ts checks them.
export const MESSAGES = {
  vi: {
    adminPages: viAdminPages,
    auth: viAuth,
    avatar: viAvatar,
    common: viCommon,
    dashboard: viDashboard,
    foods: viFoods,
    layout: viLayout,
    mealPlans: viMealPlans,
    members: viMembers,
    nutrition: viNutrition,
    pages: viPages,
    pts: viPts,
    pwa: viPwa,
    workouts: viWorkouts,
  },
  en: {
    adminPages: enAdminPages,
    auth: enAuth,
    avatar: enAvatar,
    common: enCommon,
    dashboard: enDashboard,
    foods: enFoods,
    layout: enLayout,
    mealPlans: enMealPlans,
    members: enMembers,
    nutrition: enNutrition,
    pages: enPages,
    pts: enPts,
    pwa: enPwa,
    workouts: enWorkouts,
  },
} as const satisfies Record<Locale, Record<string, object>>;

export const viMessages = MESSAGES.vi;

export const getMessages = (locale: Locale) => MESSAGES[locale];

import enAdminPages from "@/messages/en/adminPages.json";
import enAuth from "@/messages/en/auth.json";
import enAvatar from "@/messages/en/avatar.json";
import enChat from "@/messages/en/chat.json";
import enCommon from "@/messages/en/common.json";
import enDashboard from "@/messages/en/dashboard.json";
import enFoods from "@/messages/en/foods.json";
import enFormat from "@/messages/en/format.json";
import enLayout from "@/messages/en/layout.json";
import enMealPlans from "@/messages/en/mealPlans.json";
import enMembers from "@/messages/en/members.json";
import enNutrition from "@/messages/en/nutrition.json";
import enPages from "@/messages/en/pages.json";
import enPts from "@/messages/en/pts.json";
import enPush from "@/messages/en/push.json";
import enPwa from "@/messages/en/pwa.json";
import enSocial from "@/messages/en/social.json";
import enWorkouts from "@/messages/en/workouts.json";
import viAdminPages from "@/messages/vi/adminPages.json";
import viAuth from "@/messages/vi/auth.json";
import viAvatar from "@/messages/vi/avatar.json";
import viChat from "@/messages/vi/chat.json";
import viCommon from "@/messages/vi/common.json";
import viDashboard from "@/messages/vi/dashboard.json";
import viFoods from "@/messages/vi/foods.json";
import viFormat from "@/messages/vi/format.json";
import viLayout from "@/messages/vi/layout.json";
import viMealPlans from "@/messages/vi/mealPlans.json";
import viMembers from "@/messages/vi/members.json";
import viNutrition from "@/messages/vi/nutrition.json";
import viPages from "@/messages/vi/pages.json";
import viPts from "@/messages/vi/pts.json";
import viPush from "@/messages/vi/push.json";
import viPwa from "@/messages/vi/pwa.json";
import viSocial from "@/messages/vi/social.json";
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
    chat: viChat,
    common: viCommon,
    dashboard: viDashboard,
    foods: viFoods,
    format: viFormat,
    layout: viLayout,
    mealPlans: viMealPlans,
    members: viMembers,
    nutrition: viNutrition,
    pages: viPages,
    push: viPush,
    pts: viPts,
    pwa: viPwa,
    social: viSocial,
    workouts: viWorkouts,
  },
  en: {
    adminPages: enAdminPages,
    auth: enAuth,
    avatar: enAvatar,
    chat: enChat,
    common: enCommon,
    dashboard: enDashboard,
    foods: enFoods,
    format: enFormat,
    layout: enLayout,
    mealPlans: enMealPlans,
    members: enMembers,
    nutrition: enNutrition,
    pages: enPages,
    push: enPush,
    pts: enPts,
    pwa: enPwa,
    social: enSocial,
    workouts: enWorkouts,
  },
} as const satisfies Record<Locale, Record<string, object>>;

export const viMessages = MESSAGES.vi;

export const getMessages = (locale: Locale) => MESSAGES[locale];

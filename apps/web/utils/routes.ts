import {
  ADMIN_MESSAGES_SEGMENT,
  ADMIN_NUTRITION_SEGMENT,
  ADMIN_PREVIEW_SEGMENT,
  ADMIN_SUMMARY_SEGMENT,
  ROUTES,
} from "@/constants/routes";

export const getAdminUserPath = (userId: number) =>
  `${ROUTES.ADMIN_USERS}/${userId}`;

export const getAdminPreviewPath = (userId: number) =>
  `${getAdminUserPath(userId)}/${ADMIN_PREVIEW_SEGMENT}`;

export const getAdminNutritionPath = (userId: number) =>
  `${getAdminUserPath(userId)}/${ADMIN_NUTRITION_SEGMENT}`;

export const getAdminSummaryPath = (userId: number) =>
  `${getAdminUserPath(userId)}/${ADMIN_SUMMARY_SEGMENT}`;

export const getAdminMessagesPath = (userId: number) =>
  `${getAdminUserPath(userId)}/${ADMIN_MESSAGES_SEGMENT}`;

export const getFoodPath = (foodId: number) => `${ROUTES.FOODS}/${foodId}`;

export const getAdminFoodPath = (foodId: number) =>
  `${ROUTES.ADMIN_FOODS}/${foodId}`;

// Group chat screens (company G21). The paths match the push deep links the
// API builds (`groupUserPath` / `groupAdminPath` in @pt/contracts).
export const getUserGroupPath = (groupId: number) =>
  `${ROUTES.MESSAGES_GROUPS}/${groupId}`;

export const getUserGroupInfoPath = (groupId: number) =>
  `${getUserGroupPath(groupId)}/info`;

export const getAdminGroupPath = (groupId: number) =>
  `${ROUTES.ADMIN_MESSAGES_GROUPS}/${groupId}`;

export const getAdminGroupInfoPath = (groupId: number) =>
  `${getAdminGroupPath(groupId)}/info`;

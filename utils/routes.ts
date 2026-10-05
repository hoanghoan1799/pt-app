import {
  ADMIN_NUTRITION_SEGMENT,
  ADMIN_PREVIEW_SEGMENT,
  ROUTES,
} from "@/constants/routes";

export const getAdminUserPath = (userId: number) =>
  `${ROUTES.ADMIN_USERS}/${userId}`;

export const getAdminPreviewPath = (userId: number) =>
  `${getAdminUserPath(userId)}/${ADMIN_PREVIEW_SEGMENT}`;

export const getAdminNutritionPath = (userId: number) =>
  `${getAdminUserPath(userId)}/${ADMIN_NUTRITION_SEGMENT}`;

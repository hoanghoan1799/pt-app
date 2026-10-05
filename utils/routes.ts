import { ADMIN_PREVIEW_SEGMENT, ROUTES } from "@/constants/routes";

export const getAdminUserPath = (userId: number) =>
  `${ROUTES.ADMIN_USERS}/${userId}`;

export const getAdminPreviewPath = (userId: number) =>
  `${getAdminUserPath(userId)}/${ADMIN_PREVIEW_SEGMENT}`;

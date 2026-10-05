import "server-only";

import { redirect } from "next/navigation";

import { ROUTES } from "@/constants/routes";
import { ADMIN_COOKIE, USER_COOKIE } from "@/constants/session";
import { readSession } from "@/services/session";
import { findUserById } from "@/services/users";

export const getCurrentUser = async () => {
  const session = await readSession(USER_COOKIE);

  if (session?.role !== "user") {
    return null;
  }
  // The user may have been deleted by the admin since the cookie was issued.
  return findUserById(session.userId);
};

export const requireUser = async () => {
  const user = await getCurrentUser();

  if (!user) {
    redirect(ROUTES.HOME);
  }
  return user;
};

export const isAdmin = async () => {
  const session = await readSession(ADMIN_COOKIE);

  return session?.role === "admin";
};

export const requireAdmin = async () => {
  if (!(await isAdmin())) {
    redirect(ROUTES.ADMIN_LOGIN);
  }
};

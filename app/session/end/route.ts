import { type NextRequest, NextResponse } from "next/server";

import { ROUTES, SESSION_ROLE_PARAM } from "@/constants/routes";
import { ADMIN_COOKIE, USER_COOKIE } from "@/constants/session";

export const GET = (request: NextRequest) => {
  const isAdmin =
    request.nextUrl.searchParams.get(SESSION_ROLE_PARAM) === "admin";
  const response = NextResponse.redirect(
    new URL(isAdmin ? ROUTES.ADMIN_LOGIN : ROUTES.HOME, request.url),
  );

  response.cookies.delete(isAdmin ? ADMIN_COOKIE : USER_COOKIE);
  return response;
};

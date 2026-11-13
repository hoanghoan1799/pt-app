import { type NextRequest, NextResponse } from "next/server";

import { ROUTES, SESSION_ROLE_PARAM } from "@/constants/routes";
import { ADMIN_COOKIE, USER_COOKIE } from "@/constants/session";
import { revokeApiSession } from "@/services/api/revoke-session";

// Drops a session cookie the web no longer trusts (expired, revoked, locked
// admin). The token is revoked on the API first, best effort, so it does not
// stay valid after the web has forgotten it.
export const GET = async (request: NextRequest) => {
  const isAdmin =
    request.nextUrl.searchParams.get(SESSION_ROLE_PARAM) === "admin";
  const cookieName = isAdmin ? ADMIN_COOKIE : USER_COOKIE;

  await revokeApiSession(request.cookies.get(cookieName)?.value);

  const response = NextResponse.redirect(
    new URL(isAdmin ? ROUTES.ADMIN_LOGIN : ROUTES.HOME, request.url),
  );

  response.cookies.delete(cookieName);
  return response;
};

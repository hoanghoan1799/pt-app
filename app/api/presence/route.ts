import { type NextRequest, NextResponse } from "next/server";

import {
  touchAdminPresence,
  touchUserPresence,
} from "@/features/chat/services/presence";
import { issueUnlock } from "@/services/admin-lock";
import { getApiAdmin, getApiUser } from "@/services/auth-guard";

const NO_STORE = { "Cache-Control": "no-store" };

// Presence heartbeat (KAN-128). The client posts about once a minute while
// the app is visible; the service writes at most once a minute per person.
// `?as=admin` uses the admin session, otherwise the trainee's. 204 on
// success, 401 when not signed in.
export const POST = async (request: NextRequest) => {
  if (request.nextUrl.searchParams.get("as") === "admin") {
    const admin = await getApiAdmin();

    if (!admin) {
      return NextResponse.json(
        { error: "unauthorized" },
        { status: 401, headers: NO_STORE },
      );
    }
    await touchAdminPresence(admin.id);
    // getApiAdmin is null while locked, so this only slides an existing
    // unlock forward (KAN-160). Admins without a passcode need no cookie.
    if (admin.hasPasscode) {
      await issueUnlock(admin.id);
    }
    return new NextResponse(null, { status: 204, headers: NO_STORE });
  }
  const user = await getApiUser();

  if (!user) {
    return NextResponse.json(
      { error: "unauthorized" },
      { status: 401, headers: NO_STORE },
    );
  }
  await touchUserPresence(user.id);
  return new NextResponse(null, { status: 204, headers: NO_STORE });
};

import { type NextRequest, NextResponse } from "next/server";

import { canViewHealthDetails, checkHealth } from "@/services/health";

const NO_STORE = { "Cache-Control": "no-store" };

// Configuration/database diagnostics. Public callers only get ok/error; the
// details (which env var, which table…) need HEALTH_CHECK_TOKEN, sent as the
// `x-health-token` header or `?token=` (any request is allowed in development).
export const GET = async (request: NextRequest) => {
  const report = await checkHealth();
  const status = report.status === "ok" ? 200 : 503;
  const token =
    request.headers.get("x-health-token") ??
    request.nextUrl.searchParams.get("token");

  if (!canViewHealthDetails(token)) {
    return NextResponse.json(
      { status: report.status },
      { status, headers: NO_STORE },
    );
  }
  return NextResponse.json(report, { status, headers: NO_STORE });
};

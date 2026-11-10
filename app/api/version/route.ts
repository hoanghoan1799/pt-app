import { NextResponse } from "next/server";

// Public build id, no user data. Pages compare it with the id they were built
// with to notice a newer deploy (see features/pwa/hooks/use-new-version-check).
export const GET = () =>
  NextResponse.json(
    { buildId: process.env.NEXT_PUBLIC_BUILD_ID ?? "dev" },
    { headers: { "Cache-Control": "no-store" } },
  );

import { ROUTES } from "@/constants/routes";
import { buildManifest } from "@/features/pwa/utils/build-manifest";

// The PT admin app's manifest. It lives outside /admin because proxy.ts guards
// every /admin path and browsers fetch manifests without the session cookie.
export const dynamic = "force-static";

export const GET = () =>
  Response.json(
    buildManifest({
      id: ROUTES.ADMIN,
      name: "PT Admin",
      description: "Quản lý học viên và lịch tập cho PT",
      startUrl: ROUTES.ADMIN,
      scope: ROUTES.ADMIN,
    }),
    { headers: { "Content-Type": "application/manifest+json" } },
  );

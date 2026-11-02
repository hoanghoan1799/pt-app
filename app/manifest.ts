import type { MetadataRoute } from "next";

import { ROUTES } from "@/constants/routes";
import { buildManifest } from "@/features/pwa/utils/build-manifest";

const manifest = (): MetadataRoute.Manifest =>
  buildManifest({
    id: "/",
    name: "PT App",
    description: "Lịch tập luyện hằng tuần do PT giao",
    startUrl: ROUTES.WORKOUTS,
    scope: "/",
  });

export default manifest;

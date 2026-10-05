import type { MetadataRoute } from "next";

import { ROUTES } from "@/constants/routes";

const manifest = (): MetadataRoute.Manifest => ({
  name: "PT App",
  short_name: "PT App",
  description: "Lịch tập luyện hằng tuần do PT giao",
  start_url: ROUTES.WORKOUTS,
  display: "standalone",
  background_color: "#f4f4f5",
  theme_color: "#f4f4f5",
});

export default manifest;

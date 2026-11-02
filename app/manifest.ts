import type { MetadataRoute } from "next";

import { ROUTES } from "@/constants/routes";

const manifest = (): MetadataRoute.Manifest => ({
  id: "/",
  name: "PT App",
  short_name: "PT App",
  description: "Lịch tập luyện hằng tuần do PT giao",
  start_url: ROUTES.WORKOUTS,
  scope: "/",
  lang: "vi",
  orientation: "portrait",
  display: "standalone",
  background_color: "#f4f4f5",
  theme_color: "#f4f4f5",
  icons: [
    {
      src: "/icons/icon-192.png",
      sizes: "192x192",
      type: "image/png",
      purpose: "any",
    },
    {
      src: "/icons/icon-512.png",
      sizes: "512x512",
      type: "image/png",
      purpose: "any",
    },
    {
      src: "/icons/icon-maskable-512.png",
      sizes: "512x512",
      type: "image/png",
      purpose: "maskable",
    },
  ],
});

export default manifest;

import type { MetadataRoute } from "next";

// Shared by the trainee app (app/manifest.ts) and the PT admin app
// (app/admin-manifest.webmanifest). Each install gets its own id, name and
// start page, so a PT and a trainee on one phone get two separate icons.
interface AppIdentity {
  id: string;
  name: string;
  description: string;
  startUrl: string;
  scope: string;
}

const ICONS: MetadataRoute.Manifest["icons"] = [
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
];

export const buildManifest = ({
  id,
  name,
  description,
  startUrl,
  scope,
}: AppIdentity): MetadataRoute.Manifest => ({
  id,
  name,
  short_name: name,
  description,
  start_url: startUrl,
  scope,
  lang: "vi",
  orientation: "portrait",
  display: "standalone",
  background_color: "#f4f4f5",
  theme_color: "#f4f4f5",
  icons: ICONS,
});

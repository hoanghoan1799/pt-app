import type { Metadata } from "next";

import { ROUTES } from "@/constants/routes";

export const metadata: Metadata = {
  // Keep the admin area out of search results.
  robots: { index: false, follow: false },
  // "Add to Home Screen" from any admin page installs the PT Admin app, which
  // opens on the dashboard instead of the trainee login.
  manifest: ROUTES.ADMIN_MANIFEST,
  appleWebApp: { capable: true, title: "PT Admin", statusBarStyle: "default" },
};

const AdminLayout = ({ children }: LayoutProps<"/admin">) => children;

export default AdminLayout;

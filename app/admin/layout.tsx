import type { Metadata } from "next";

export const metadata: Metadata = {
  // Keep the admin area out of search results.
  robots: { index: false, follow: false },
};

const AdminLayout = ({ children }: LayoutProps<"/admin">) => children;

export default AdminLayout;

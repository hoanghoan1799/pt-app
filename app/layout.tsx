import "./globals.css";

import type { Metadata, Viewport } from "next";

import { AppToaster } from "@/components/common/AppToaster";
import { ServiceWorkerRegister } from "@/features/pwa/components/ServiceWorkerRegister";

export const metadata: Metadata = {
  title: { default: "PT App", template: "%s · PT App" },
  description: "Lịch tập luyện hằng tuần do PT giao",
  icons: { apple: "/icons/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "PT App", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Lets the page draw under the notch / Dynamic Island; headers pad with
  // env(safe-area-inset-*).
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f4f5" },
    { media: "(prefers-color-scheme: dark)", color: "#0c0c0e" },
  ],
};

const RootLayout = ({ children }: LayoutProps<"/">) => (
  <html lang="vi">
    <body className="min-h-dvh antialiased">
      {children}
      <AppToaster />
      <ServiceWorkerRegister />
    </body>
  </html>
);

export default RootLayout;

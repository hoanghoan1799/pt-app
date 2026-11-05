import "./globals.css";

import type { Metadata, Viewport } from "next";

import { AppToaster } from "@/components/common/AppToaster";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { ServiceWorkerRegister } from "@/features/pwa/components/ServiceWorkerRegister";
import { INSTALL_CAPTURE_SCRIPT } from "@/features/pwa/constants/capture-script";

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
    <head>
      <script dangerouslySetInnerHTML={{ __html: INSTALL_CAPTURE_SCRIPT }} />
    </head>
    <body className="min-h-dvh antialiased">
      {children}
      <AppToaster />
      <ConfirmDialog />
      <ServiceWorkerRegister />
    </body>
  </html>
);

export default RootLayout;

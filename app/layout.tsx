import "./globals.css";

import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";

import { AppToaster } from "@/components/common/AppToaster";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { ServiceWorkerRegister } from "@/features/pwa/components/ServiceWorkerRegister";
import { INSTALL_CAPTURE_SCRIPT } from "@/features/pwa/constants/capture-script";
import { parseTheme, THEME_COOKIE } from "@/utils/theme";

export const generateMetadata = async (): Promise<Metadata> => {
  const t = await getTranslations("layout.meta");

  return {
    title: { default: "PT App", template: "%s · PT App" },
    description: t("description"),
    icons: { apple: "/icons/apple-touch-icon.png" },
    appleWebApp: { capable: true, title: "PT App", statusBarStyle: "default" },
  };
};

const THEME_COLORS = { light: "#f4f4f5", dark: "#0c0c0e" };

// A forced theme sets one browser chrome color; "Hệ thống" follows the OS.
export const generateViewport = async (): Promise<Viewport> => {
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);

  return {
    width: "device-width",
    initialScale: 1,
    // Lets the page draw under the notch / Dynamic Island; headers pad with
    // env(safe-area-inset-*).
    viewportFit: "cover",
    themeColor:
      theme === "system"
        ? [
            {
              media: "(prefers-color-scheme: light)",
              color: THEME_COLORS.light,
            },
            { media: "(prefers-color-scheme: dark)", color: THEME_COLORS.dark },
          ]
        : THEME_COLORS[theme],
  };
};

// Reads the theme cookie on the server so the first paint already has the right
// colors (no flash). This makes every route dynamic.
const RootLayout = async ({ children }: LayoutProps<"/">) => {
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale} data-theme={theme}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: INSTALL_CAPTURE_SCRIPT }} />
      </head>
      <body className="min-h-dvh antialiased">
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
          <AppToaster />
          <ConfirmDialog />
          <ServiceWorkerRegister />
        </NextIntlClientProvider>
      </body>
    </html>
  );
};

export default RootLayout;

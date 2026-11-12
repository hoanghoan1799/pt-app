"use client";

import "./globals.css";

import { NextIntlClientProvider } from "next-intl";

import { ErrorFallback } from "@/components/common/ErrorFallback";
import { viMessages } from "@/i18n/messages";

interface GlobalErrorProps {
  error: Error & { digest?: string };
  retry: () => void;
}

// Replaces the root layout when it fails, so it brings its own document and its
// own provider. The locale cookie is httpOnly and the request config is not
// available here, so this last-resort screen is always Vietnamese.
const GlobalError = ({ error, retry }: GlobalErrorProps) => (
  <html lang="vi">
    <body className="min-h-dvh antialiased">
      <title>{viMessages.layout.globalError.documentTitle} · PT App</title>
      <NextIntlClientProvider locale="vi" messages={viMessages}>
        <ErrorFallback error={error} onRetry={retry} />
      </NextIntlClientProvider>
    </body>
  </html>
);

export default GlobalError;

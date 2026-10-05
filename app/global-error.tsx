"use client";

import "./globals.css";

import { ErrorFallback } from "@/components/common/ErrorFallback";

interface GlobalErrorProps {
  error: Error & { digest?: string };
  retry: () => void;
}

// Replaces the root layout when it fails, so it brings its own document.
const GlobalError = ({ error, retry }: GlobalErrorProps) => (
  <html lang="vi">
    <body className="min-h-dvh antialiased">
      <title>Lỗi · PT App</title>
      <ErrorFallback error={error} onRetry={retry} />
    </body>
  </html>
);

export default GlobalError;

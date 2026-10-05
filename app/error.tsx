"use client";

import { ErrorFallback } from "@/components/common/ErrorFallback";

interface ErrorPageProps {
  error: Error & { digest?: string };
  retry: () => void;
}

const ErrorPage = ({ error, retry }: ErrorPageProps) => (
  <ErrorFallback error={error} onRetry={retry} />
);

export default ErrorPage;

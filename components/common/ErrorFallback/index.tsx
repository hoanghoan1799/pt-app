"use client";

import { RotateCcw, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect } from "react";

import { BUTTON_PRIMARY, BUTTON_SECONDARY, CARD } from "@/constants/styles";

interface ErrorFallbackProps {
  error: Error & { digest?: string };
  onRetry: () => void;
}

const IS_DEVELOPMENT = process.env.NODE_ENV === "development";

// In production Next.js hides server error messages from the browser; the
// digest matches the "[pt-app] … failed" line in the server logs.
export const ErrorFallback = ({ error, onRetry }: ErrorFallbackProps) => {
  const t = useTranslations("common.errorFallback");

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 pt-[calc(env(safe-area-inset-top)+2rem)] pb-[calc(env(safe-area-inset-bottom)+2rem)]">
      <div className={`${CARD} p-6 text-center`}>
        <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-danger/12 text-danger">
          <TriangleAlert className="size-7" aria-hidden />
        </span>
        <h1 className="mt-4 text-xl font-bold text-fg">{t("title")}</h1>
        <p className="mt-2 text-sm text-muted">
          {IS_DEVELOPMENT ? error.message : t("serverError")}
        </p>
        {error.digest && (
          <p className="mt-3 rounded-lg bg-line/60 px-3 py-2 font-mono text-xs text-fg">
            {t("referenceCode", { code: error.digest })}
          </p>
        )}
        <div className="mt-6 grid gap-2">
          <button
            type="button"
            onClick={onRetry}
            className={`${BUTTON_PRIMARY} w-full`}
          >
            <RotateCcw className="size-5" aria-hidden />
            {t("retry")}
          </button>
          <Link href="/" className={`${BUTTON_SECONDARY} w-full`}>
            {t("home")}
          </Link>
        </div>
      </div>
    </main>
  );
};

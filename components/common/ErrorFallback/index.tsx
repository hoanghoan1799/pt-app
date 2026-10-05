"use client";

import { RotateCcw, TriangleAlert } from "lucide-react";
import Link from "next/link";
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
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 pt-[calc(env(safe-area-inset-top)+2rem)] pb-[calc(env(safe-area-inset-bottom)+2rem)]">
      <div className={`${CARD} p-6 text-center`}>
        <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-danger/12 text-danger">
          <TriangleAlert className="size-7" aria-hidden />
        </span>
        <h1 className="mt-4 text-xl font-bold text-fg">Đã có lỗi xảy ra</h1>
        <p className="mt-2 text-sm text-muted">
          {IS_DEVELOPMENT
            ? error.message
            : "Server gặp sự cố khi tải trang này. Thử lại sau ít phút; nếu vẫn lỗi, gửi mã bên dưới cho PT."}
        </p>
        {error.digest && (
          <p className="mt-3 rounded-lg bg-line/60 px-3 py-2 font-mono text-xs text-fg">
            Mã tham chiếu: {error.digest}
          </p>
        )}
        <div className="mt-6 grid gap-2">
          <button
            type="button"
            onClick={onRetry}
            className={`${BUTTON_PRIMARY} w-full`}
          >
            <RotateCcw className="size-5" aria-hidden />
            Thử lại
          </button>
          <Link href="/" className={`${BUTTON_SECONDARY} w-full`}>
            Về trang đầu
          </Link>
        </div>
      </div>
    </main>
  );
};

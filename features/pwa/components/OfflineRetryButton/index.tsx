"use client";

export const OfflineRetryButton = () => (
  <button
    type="button"
    onClick={() => window.location.reload()}
    className="mt-6 inline-flex min-h-12 items-center justify-center rounded-2xl bg-accent px-6 text-sm font-semibold text-accent-fg shadow-md shadow-accent/25 active:opacity-80"
  >
    Thử lại
  </button>
);

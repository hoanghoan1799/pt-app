import { useTranslations } from "next-intl";
import type { RefObject } from "react";

interface GalleryFooterProps {
  sentinel: RefObject<HTMLDivElement | null>;
  cursor: number | null;
  error: string | null;
  onRetry: () => void;
}

// Under a gallery list: "loading" while more pages remain (the sentinel the
// pager watches), or a retry button after a failed page.
export const GalleryFooter = ({
  sentinel,
  cursor,
  error,
  onRetry,
}: GalleryFooterProps) => {
  const t = useTranslations("chat.galleryFooter");

  return cursor === null ? null : (
    <div ref={sentinel} className="flex justify-center px-4 py-6">
      {error ? (
        <button
          type="button"
          onClick={onRetry}
          className="rounded-full border border-line bg-surface px-4 py-2 text-sm font-medium text-muted transition active:bg-line"
        >
          {error}
        </button>
      ) : (
        <p className="text-sm text-muted" role="status">
          {t("loading")}
        </p>
      )}
    </div>
  );
};

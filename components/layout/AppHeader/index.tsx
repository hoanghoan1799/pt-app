import clsx from "clsx";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { Skeleton } from "@/components/common/Skeleton";
import { ICON_BUTTON, PAGE_CONTAINER } from "@/constants/styles";

interface AppHeaderProps {
  // ReactNode so loading screens can put a skeleton where data-driven text goes.
  title: ReactNode;
  eyebrow?: ReactNode;
  backHref?: string;
  // Loading screens: the back target depends on data, show a placeholder.
  isBackLoading?: boolean;
  actions?: ReactNode;
}

export const AppHeader = ({
  title,
  eyebrow,
  backHref,
  isBackLoading = false,
  actions,
}: AppHeaderProps) => {
  const t = useTranslations("layout.header");

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/85 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
      <div className={clsx(PAGE_CONTAINER, "flex min-h-14 items-center gap-1")}>
        {backHref && (
          <Link
            href={backHref}
            className={clsx(ICON_BUTTON, "-ml-3")}
            aria-label={t("back")}
          >
            <ChevronLeft className="size-6" />
          </Link>
        )}
        {!backHref && isBackLoading && (
          <div className={clsx(ICON_BUTTON, "-ml-3")} aria-hidden>
            <Skeleton className="size-6 rounded-full" />
          </div>
        )}
        <div className="min-w-0 flex-1 py-2">
          {eyebrow && (
            <p className="truncate text-xs font-medium text-muted">{eyebrow}</p>
          )}
          <h1 className="truncate text-lg leading-tight font-bold text-fg">
            {title}
          </h1>
        </div>
        {actions && <div className="-mr-3 flex items-center">{actions}</div>}
      </div>
    </header>
  );
};

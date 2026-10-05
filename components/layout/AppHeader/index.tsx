import clsx from "clsx";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { ICON_BUTTON, PAGE_CONTAINER } from "@/constants/styles";

interface AppHeaderProps {
  title: string;
  eyebrow?: string;
  backHref?: string;
  actions?: ReactNode;
}

export const AppHeader = ({
  title,
  eyebrow,
  backHref,
  actions,
}: AppHeaderProps) => (
  <header className="sticky top-0 z-30 border-b border-line bg-bg/85 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
    <div className={clsx(PAGE_CONTAINER, "flex min-h-14 items-center gap-1")}>
      {backHref && (
        <Link
          href={backHref}
          className={clsx(ICON_BUTTON, "-ml-3")}
          aria-label="Quay lại"
        >
          <ChevronLeft className="size-6" />
        </Link>
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

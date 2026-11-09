import clsx from "clsx";
import { Search } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { Input } from "@/components/common/Input";
import { PageSkeleton } from "@/components/common/PageSkeleton";
import { SkeletonList } from "@/components/common/Skeleton";
import { AppHeader } from "@/components/layout/AppHeader";
import { ROUTES } from "@/constants/routes";

const FILTERS = [
  { key: "all", href: ROUTES.ADMIN_MESSAGES },
  { key: "unread", href: `${ROUTES.ADMIN_MESSAGES}?filter=unread` },
] as const;

// Search box, select button and filter pills are static and render for real
// (the filter is not in the params loading.tsx gets, so "all" shows active).
export default async function Loading() {
  const t = await getTranslations("chat.pages");
  const tInbox = await getTranslations("chat.adminInbox");

  return (
    <PageSkeleton
      hasTabBar={false}
      header={
        <AppHeader title={t("adminMessagesTitle")} backHref={ROUTES.ADMIN} />
      }
    >
      <div className="flex items-center gap-2">
        <Input
          type="search"
          clearable
          leadingIcon={<Search className="size-4" aria-hidden />}
          wrapperClassName="min-w-0 flex-1"
          placeholder={tInbox("searchPlaceholder")}
          aria-label={tInbox("searchPlaceholder")}
          autoComplete="off"
          enterKeyHint="search"
        />
        <span className="inline-flex min-h-12 shrink-0 items-center rounded-xl px-3 text-base font-semibold text-accent">
          {tInbox("select")}
        </span>
      </div>
      <nav aria-label={t("filtersLabel")} className="flex gap-2">
        {FILTERS.map((filter) => {
          const isActive = filter.key === "all";

          return (
            <Link
              key={filter.key}
              href={filter.href}
              aria-current={isActive ? "page" : undefined}
              className={clsx(
                "inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-semibold transition",
                isActive
                  ? "border-accent bg-accent text-accent-fg"
                  : "border-line bg-surface text-muted active:bg-line",
              )}
            >
              {t(`filters.${filter.key}`)}
            </Link>
          );
        })}
      </nav>
      <SkeletonList rows={6} />
    </PageSkeleton>
  );
}

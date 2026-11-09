import clsx from "clsx";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { ROUTES } from "@/constants/routes";

export type FriendsTab = "friends" | "requests" | "search";

const TABS: { id: FriendsTab }[] = [
  { id: "friends" },
  { id: "requests" },
  { id: "search" },
];

export const parseFriendsTab = (value: string | undefined): FriendsTab =>
  value === "requests" || value === "search" ? value : "friends";

export const FriendsTabs = ({
  active,
  requestCount,
}: {
  active: FriendsTab;
  requestCount: number;
}) => {
  const t = useTranslations("social.friendsTabs");

  return (
    <nav aria-label={t("navLabel")} className="grid grid-cols-3 gap-1">
      {TABS.map((tab) => (
        <Link
          key={tab.id}
          href={
            tab.id === "friends"
              ? ROUTES.FRIENDS
              : `${ROUTES.FRIENDS}?tab=${tab.id}`
          }
          aria-current={tab.id === active ? "page" : undefined}
          className={clsx(
            "flex min-h-12 items-center justify-center gap-1 rounded-xl px-2 text-center text-sm font-semibold",
            tab.id === active
              ? "bg-accent text-accent-fg"
              : "border border-line bg-surface text-fg active:bg-line/60",
          )}
        >
          {t(`tabs.${tab.id}`)}
          {tab.id === "requests" && requestCount > 0 && ` (${requestCount})`}
        </Link>
      ))}
    </nav>
  );
};

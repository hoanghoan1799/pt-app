"use client";

import clsx from "clsx";
import {
  ChartColumn,
  Dumbbell,
  type LucideIcon,
  MessageCircle,
  Newspaper,
  Utensils,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

import { ROUTES } from "@/constants/routes";
import { UnreadBadge } from "@/features/chat/components/UnreadBadge";
import { useChatUnread } from "@/features/chat/hooks/use-chat-unread";
import { useIsEmbedded } from "@/features/chat-bubbles/hooks/use-is-embedded";

const TABS: {
  href: string;
  labelKey: "feed" | "workouts" | "nutrition" | "messages" | "summary";
  icon: LucideIcon;
  // Other pages that belong to the tab, e.g. the food library under nutrition.
  alsoActiveOn?: string;
}[] = [
  {
    href: ROUTES.FEED,
    labelKey: "feed",
    icon: Newspaper,
    alsoActiveOn: ROUTES.PROFILE,
  },
  { href: ROUTES.WORKOUTS, labelKey: "workouts", icon: Dumbbell },
  {
    href: ROUTES.NUTRITION,
    labelKey: "nutrition",
    icon: Utensils,
    alsoActiveOn: ROUTES.FOODS,
  },
  { href: ROUTES.MESSAGES, labelKey: "messages", icon: MessageCircle },
  { href: ROUTES.SUMMARY, labelKey: "summary", icon: ChartColumn },
];

// The page itself or anything below it, so "/foods" never matches "/foodstuff".
const isUnder = (pathname: string, base: string) =>
  pathname === base || pathname.startsWith(`${base}/`);

// Floating tab bar above the home indicator; the active tab is a filled
// pill so it reads at a glance, not just a tinted icon.
export const UserTabBar = () => {
  const t = useTranslations("layout.userTabs");
  const pathname = usePathname();
  // The inbox keeps the bar; every thread (coach, friend or group) has its own
  // header and composer, which the bar would cover.
  const inChat =
    isUnder(pathname, ROUTES.MESSAGES_COACH) ||
    isUnder(pathname, ROUTES.MESSAGES_DM) ||
    isUnder(pathname, ROUTES.MESSAGES_GROUPS);
  const isEmbedded = useIsEmbedded();
  const unread = useChatUnread(inChat || isEmbedded);

  if (inChat || isEmbedded) {
    return null;
  }

  return (
    <nav
      aria-label={t("label")}
      data-app-chrome
      className="pointer-events-none fixed inset-x-0 bottom-0 z-30 px-3 pb-[calc(env(safe-area-inset-bottom)+0.5rem)]"
    >
      <ul
        className={clsx(
          "pointer-events-auto mx-auto grid max-w-md gap-1 rounded-[1.75rem] border border-line bg-surface p-1.5 shadow-[0_10px_30px_-8px_rgb(0_0_0/0.35)]",
          "grid-cols-5",
        )}
      >
        {TABS.map(({ href, labelKey, icon: Icon, alsoActiveOn }) => {
          const isActive =
            isUnder(pathname, href) ||
            Boolean(alsoActiveOn && isUnder(pathname, alsoActiveOn));

          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={isActive ? "page" : undefined}
                className={clsx(
                  "flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-[1.375rem] text-[10px] min-[360px]:text-[11px] font-semibold transition-colors duration-200",
                  isActive
                    ? "bg-accent text-accent-fg shadow-md shadow-accent/30"
                    : "text-muted active:bg-line/70",
                )}
              >
                <span className="relative">
                  <Icon
                    className="size-5"
                    strokeWidth={isActive ? 2.4 : 2}
                    aria-hidden
                  />
                  {href === ROUTES.MESSAGES && (
                    <UnreadBadge
                      count={unread}
                      className="absolute -top-1.5 -right-2.5 ring-2 ring-surface"
                    />
                  )}
                </span>
                {t(labelKey)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
};

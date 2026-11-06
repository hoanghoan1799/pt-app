"use client";

import clsx from "clsx";
import {
  ChartColumn,
  Dumbbell,
  type LucideIcon,
  MessageCircle,
  Utensils,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { ROUTES } from "@/constants/routes";
import { UnreadBadge } from "@/features/chat/components/UnreadBadge";
import { useChatUnread } from "@/features/chat/hooks/use-chat-unread";

const TABS: {
  href: string;
  label: string;
  icon: LucideIcon;
  // Other pages that belong to the tab, e.g. the food library under nutrition.
  alsoActiveOn?: string;
}[] = [
  { href: ROUTES.WORKOUTS, label: "Lịch tập", icon: Dumbbell },
  {
    href: ROUTES.NUTRITION,
    label: "Dinh dưỡng",
    icon: Utensils,
    alsoActiveOn: ROUTES.FOODS,
  },
  { href: ROUTES.MESSAGES, label: "Nhắn tin", icon: MessageCircle },
  { href: ROUTES.SUMMARY, label: "Tổng kết", icon: ChartColumn },
];

// The page itself or anything below it, so "/foods" never matches "/foodstuff".
const isUnder = (pathname: string, base: string) =>
  pathname === base || pathname.startsWith(`${base}/`);

// Floating tab bar above the home indicator; the active tab is a filled
// pill so it reads at a glance, not just a tinted icon.
export const UserTabBar = () => {
  const pathname = usePathname();
  const inChat = isUnder(pathname, ROUTES.MESSAGES);
  const unread = useChatUnread(inChat);

  // The thread has its own header and composer; the bar would cover them.
  if (inChat) {
    return null;
  }

  return (
    <nav
      aria-label="Chuyển mục"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-30 px-3 pb-[calc(env(safe-area-inset-bottom)+0.5rem)]"
    >
      <ul
        className={clsx(
          "pointer-events-auto mx-auto grid max-w-md gap-1 rounded-[1.75rem] border border-line bg-surface/90 p-1.5 shadow-[0_10px_30px_-8px_rgb(0_0_0/0.35)] backdrop-blur-xl",
          "grid-cols-4",
        )}
      >
        {TABS.map(({ href, label, icon: Icon, alsoActiveOn }) => {
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
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
};

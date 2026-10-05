"use client";

import clsx from "clsx";
import { ChartColumn, Dumbbell, type LucideIcon, Utensils } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { ROUTES } from "@/constants/routes";

const TABS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: ROUTES.WORKOUTS, label: "Lịch tập", icon: Dumbbell },
  { href: ROUTES.NUTRITION, label: "Dinh dưỡng", icon: Utensils },
  { href: ROUTES.SUMMARY, label: "Tổng kết", icon: ChartColumn },
];

// Floating tab bar above the home indicator; the active tab is a filled
// pill so it reads at a glance, not just a tinted icon.
export const UserTabBar = () => {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Chuyển mục"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-30 px-3 pb-[calc(env(safe-area-inset-bottom)+0.5rem)]"
    >
      <ul className="pointer-events-auto mx-auto grid max-w-md grid-cols-3 gap-1 rounded-[1.75rem] border border-line bg-surface/90 p-1.5 shadow-[0_10px_30px_-8px_rgb(0_0_0/0.35)] backdrop-blur-xl">
        {TABS.map(({ href, label, icon: Icon }) => {
          const isActive = pathname.startsWith(href);

          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={isActive ? "page" : undefined}
                className={clsx(
                  "flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-[1.375rem] text-[11px] font-semibold transition-colors duration-200",
                  isActive
                    ? "bg-accent text-accent-fg shadow-md shadow-accent/30"
                    : "text-muted active:bg-line/70",
                )}
              >
                <Icon
                  className="size-5"
                  strokeWidth={isActive ? 2.4 : 2}
                  aria-hidden
                />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
};

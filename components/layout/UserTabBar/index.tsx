"use client";

import clsx from "clsx";
import { Dumbbell, type LucideIcon, Utensils } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { ROUTES } from "@/constants/routes";

const TABS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: ROUTES.WORKOUTS, label: "Lịch tập", icon: Dumbbell },
  { href: ROUTES.NUTRITION, label: "Dinh dưỡng", icon: Utensils },
];

// iOS-style bottom tab bar; sits above the home indicator.
export const UserTabBar = () => {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Chuyển mục"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl"
    >
      <ul className="mx-auto grid max-w-lg grid-cols-2">
        {TABS.map(({ href, label, icon: Icon }) => {
          const isActive = pathname.startsWith(href);

          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={isActive ? "page" : undefined}
                className={clsx(
                  "flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold transition active:opacity-60",
                  isActive ? "text-accent" : "text-muted",
                )}
              >
                <Icon
                  className="size-6"
                  strokeWidth={isActive ? 2.4 : 1.8}
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

import clsx from "clsx";
import Link from "next/link";

import { PAGE_CONTAINER } from "@/constants/styles";
import { getAdminNutritionPath, getAdminUserPath } from "@/utils/routes";

interface MemberSectionTabsProps {
  userId: number;
  active: "workouts" | "nutrition";
  weekStart: string;
}

// Segmented control switching between a member's workouts and nutrition.
export const MemberSectionTabs = ({
  userId,
  active,
  weekStart,
}: MemberSectionTabsProps) => {
  const query = `?${new URLSearchParams({ week: weekStart })}`;
  const tabs = [
    {
      key: "workouts",
      label: "Lịch tập",
      href: `${getAdminUserPath(userId)}${query}`,
    },
    {
      key: "nutrition",
      label: "Dinh dưỡng",
      href: `${getAdminNutritionPath(userId)}${query}`,
    },
  ] as const;

  return (
    <nav aria-label="Mục của user" className={`${PAGE_CONTAINER} pt-3`}>
      <ul className="grid grid-cols-2 gap-1 rounded-xl bg-line/60 p-1">
        {tabs.map((tab) => (
          <li key={tab.key}>
            <Link
              href={tab.href}
              aria-current={active === tab.key ? "page" : undefined}
              className={clsx(
                "flex min-h-10 items-center justify-center rounded-lg text-sm font-semibold transition",
                active === tab.key
                  ? "bg-surface text-fg shadow-sm"
                  : "text-muted",
              )}
            >
              {tab.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
};

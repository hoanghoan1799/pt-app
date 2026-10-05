import clsx from "clsx";
import Link from "next/link";

import { PAGE_CONTAINER } from "@/constants/styles";
import {
  getAdminNutritionPath,
  getAdminSummaryPath,
  getAdminUserPath,
} from "@/utils/routes";

type MemberSection = "workouts" | "nutrition" | "summary";

interface MemberSectionTabsProps {
  userId: number;
  active: MemberSection;
  weekStart: string;
}

const SECTIONS: {
  key: MemberSection;
  label: string;
  getPath: (userId: number) => string;
}[] = [
  { key: "workouts", label: "Lịch tập", getPath: getAdminUserPath },
  { key: "nutrition", label: "Dinh dưỡng", getPath: getAdminNutritionPath },
  { key: "summary", label: "Tổng kết", getPath: getAdminSummaryPath },
];

// Segmented control switching between a member's workouts, nutrition and
// weekly summary; keeps the selected week.
export const MemberSectionTabs = ({
  userId,
  active,
  weekStart,
}: MemberSectionTabsProps) => {
  const query = `?${new URLSearchParams({ week: weekStart })}`;

  return (
    <nav aria-label="Mục của user" className={`${PAGE_CONTAINER} pt-3`}>
      <ul className="grid grid-cols-3 gap-1 rounded-xl bg-line/60 p-1">
        {SECTIONS.map((section) => (
          <li key={section.key}>
            <Link
              href={`${section.getPath(userId)}${query}`}
              aria-current={active === section.key ? "page" : undefined}
              className={clsx(
                "flex min-h-10 items-center justify-center rounded-lg text-sm font-semibold transition",
                active === section.key
                  ? "bg-surface text-fg shadow-sm"
                  : "text-muted",
              )}
            >
              {section.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
};

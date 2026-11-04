import clsx from "clsx";
import Link from "next/link";

import { PAGE_CONTAINER } from "@/constants/styles";
import {
  getAdminMessagesPath,
  getAdminNutritionPath,
  getAdminSummaryPath,
  getAdminUserPath,
} from "@/utils/routes";

type MemberSection = "workouts" | "nutrition" | "summary" | "messages";

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
  { key: "messages", label: "Nhắn tin", getPath: getAdminMessagesPath },
];

// Segmented control switching between a member's workouts, nutrition,
// weekly summary and chat; keeps the selected week.
export const MemberSectionTabs = ({
  userId,
  active,
  weekStart,
}: MemberSectionTabsProps) => {
  const query = `?${new URLSearchParams({ week: weekStart })}`;

  return (
    <nav aria-label="Mục của user" className={`${PAGE_CONTAINER} pt-3`}>
      <ul className="grid grid-cols-4 gap-1 rounded-2xl border border-line bg-surface p-1 shadow-sm">
        {SECTIONS.map((section) => (
          <li key={section.key}>
            <Link
              href={`${section.getPath(userId)}${query}`}
              aria-current={active === section.key ? "page" : undefined}
              className={clsx(
                "flex min-h-11 items-center justify-center rounded-xl px-0.5 text-xs font-semibold min-[360px]:text-[13px] sm:text-sm transition-colors duration-200",
                active === section.key
                  ? "bg-accent text-accent-fg shadow-md shadow-accent/25"
                  : "text-muted active:bg-line",
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

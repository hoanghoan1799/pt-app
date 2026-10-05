import { CalendarCheck, Dumbbell, Flame, Users } from "lucide-react";

import { StatTile } from "@/features/dashboard/components/StatTile";
import type { WeekSummary } from "@/features/dashboard/types/dashboard";

interface WeekSummaryTilesProps {
  summary: WeekSummary;
}

export const WeekSummaryTiles = ({ summary }: WeekSummaryTilesProps) => (
  <div className="grid grid-cols-2 gap-3">
    <StatTile
      icon={Users}
      label="User"
      value={String(summary.memberCount)}
      hint={`${summary.plannedCount} người có lịch tuần này`}
    />
    <StatTile
      icon={Flame}
      label="Đang tập"
      value={`${summary.activeCount}/${summary.plannedCount}`}
      hint="đã tập ít nhất 1 bài"
    />
    <StatTile
      icon={CalendarCheck}
      label="Hoàn thành"
      value={`${summary.percent}%`}
      hint="số bài đã tập / đã giao"
    />
    <StatTile
      icon={Dumbbell}
      label="Bài đã tập"
      value={String(summary.completed)}
      hint={`trên ${summary.assigned} bài đã giao`}
    />
  </div>
);

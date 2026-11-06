import {
  DAY_STATUS_DOT_CLASSES,
  type WeekDayStatus,
} from "@/components/common/WeekDayTabs";

const LEGEND: { status: WeekDayStatus; label: string }[] = [
  { status: "complete", label: "Đã hoàn thành" },
  { status: "partial", label: "Đang thực hiện" },
];

// Key for the green and orange day markers in the week calendar.
export const DayStatusLegend = () => (
  <ul
    aria-label="Chú thích màu ngày"
    className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted"
  >
    {LEGEND.map(({ status, label }) => (
      <li key={status} className="flex items-center gap-1.5">
        <span
          aria-hidden
          className={`size-2 rounded-full ${DAY_STATUS_DOT_CLASSES[status]}`}
        />
        {label}
      </li>
    ))}
  </ul>
);

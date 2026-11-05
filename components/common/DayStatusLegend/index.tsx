import {
  DAY_STATUS_DOT_CLASSES,
  type WeekDayStatus,
} from "@/components/common/WeekDayTabs";

const LEGEND: { status: WeekDayStatus; label: string }[] = [
  { status: "complete", label: "Đủ bữa" },
  { status: "partial", label: "Một số bữa" },
  { status: "none", label: "Chưa có" },
];

// Key for the green, yellow and grey day markers under the week strip.
export const DayStatusLegend = () => (
  <ul
    aria-label="Chú thích màu ngày"
    className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-muted"
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

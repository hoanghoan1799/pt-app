import clsx from "clsx";

interface ProgressBarProps {
  percent: number;
  label: string;
  className?: string;
}

export const ProgressBar = ({
  percent,
  label,
  className,
}: ProgressBarProps) => {
  const value = Math.min(100, Math.max(0, percent));

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
      className={clsx("h-2 overflow-hidden rounded-full bg-line", className)}
    >
      <div
        className={clsx(
          "h-full rounded-full transition-[width] duration-500",
          value === 100 ? "bg-success" : "bg-accent",
        )}
        style={{ width: `${value}%` }}
      />
    </div>
  );
};

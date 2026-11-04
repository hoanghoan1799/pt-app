import clsx from "clsx";

interface UnreadBadgeProps {
  count: number;
  className?: string;
}

const MAX_SHOWN = 9;

// Red dot with the number (9+ above nine), for the tab icon and later the
// admin header. Renders nothing at zero.
export const UnreadBadge = ({ count, className }: UnreadBadgeProps) => {
  if (count <= 0) {
    return null;
  }
  return (
    <span
      role="status"
      aria-label={`${count} tin nhắn chưa đọc`}
      className={clsx(
        "inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] leading-none font-bold text-white",
        className,
      )}
    >
      {count > MAX_SHOWN ? `${MAX_SHOWN}+` : count}
    </span>
  );
};

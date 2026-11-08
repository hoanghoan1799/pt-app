import clsx from "clsx";

interface VerifiedBadgeProps {
  className?: string;
}

// The blue tick next to a verified admin's name (TikTok style): a scalloped
// blue seal with a white check. Decorative text is provided by the label.
export const VerifiedBadge = ({ className }: VerifiedBadgeProps) => (
  <svg
    viewBox="0 0 24 24"
    role="img"
    aria-label="Đã xác minh"
    className={clsx("inline-block size-4 shrink-0 align-[-0.15em]", className)}
  >
    <path
      fill="#20a5f8"
      d="M12 1.5l2.4 1.9 3-.2 1.1 2.8 2.7 1.4-.6 3 1.2 2.8-2 2.2-.3 3-3 .7-1.9 2.4-2.8-1.2-2.8 1.2-1.9-2.4-3-.7-.3-3-2-2.2L3.4 9.4l-.6-3 2.7-1.4 1.1-2.8 3 .2z"
    />
    <path
      fill="none"
      stroke="#fff"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M7.8 12.4l3 3 5.4-6"
    />
  </svg>
);

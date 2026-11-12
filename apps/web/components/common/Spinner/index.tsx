import { Loader2 } from "lucide-react";

const SIZES = { sm: "size-4", md: "size-5", lg: "size-6" } as const;

interface SpinnerProps {
  size?: keyof typeof SIZES;
  className?: string;
  // Screen-reader text; when set the spinner is announced instead of hidden.
  label?: string;
}

export const Spinner = ({
  size = "md",
  className = "",
  label,
}: SpinnerProps) => {
  const icon = (
    <Loader2
      className={`${SIZES[size]} animate-spin motion-reduce:animate-none ${className}`}
      aria-hidden
    />
  );

  if (!label) {
    return icon;
  }

  return (
    <span role="status" className="inline-flex">
      {icon}
      <span className="sr-only">{label}</span>
    </span>
  );
};

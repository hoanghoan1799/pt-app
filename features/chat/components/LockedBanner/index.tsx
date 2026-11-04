import { Lock } from "lucide-react";

interface LockedBannerProps {
  text: string;
}

// Shown instead of the composer when chat is locked; history stays readable
// above it.
export const LockedBanner = ({ text }: LockedBannerProps) => (
  <div
    role="status"
    className="mx-3 flex items-center justify-center gap-2 rounded-2xl border border-line bg-surface px-4 py-3 text-sm font-medium text-muted"
  >
    <Lock className="size-4 shrink-0" aria-hidden />
    {text}
  </div>
);

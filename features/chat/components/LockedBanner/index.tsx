import { Lock } from "lucide-react";

import { CHAT_MESSAGES } from "@/features/chat/constants/messages";

// Shown instead of the composer when the PT has locked chat; history stays
// readable above it.
export const LockedBanner = () => (
  <div
    role="status"
    className="mx-3 flex items-center justify-center gap-2 rounded-2xl border border-line bg-surface px-4 py-3 text-sm font-medium text-muted"
  >
    <Lock className="size-4 shrink-0" aria-hidden />
    {CHAT_MESSAGES.CHAT_LOCKED}
  </div>
);

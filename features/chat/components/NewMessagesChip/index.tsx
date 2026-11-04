import { ArrowDown } from "lucide-react";

interface NewMessagesChipProps {
  onClick: () => void;
}

// Floats above the composer while the reader is scrolled up and news arrived.
export const NewMessagesChip = ({ onClick }: NewMessagesChipProps) => (
  <button
    type="button"
    onClick={onClick}
    className="absolute bottom-2 left-1/2 z-10 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-fg shadow-lg shadow-black/25 transition active:scale-95"
  >
    Tin nhắn mới
    <ArrowDown className="size-4" aria-hidden />
  </button>
);

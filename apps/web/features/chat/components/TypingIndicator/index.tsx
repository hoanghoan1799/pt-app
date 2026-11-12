import { useTranslations } from "next-intl";

interface TypingIndicatorProps {
  name: string;
}

const DOT_DELAYS_MS = [0, 150, 300];

// Peer bubble with three dots and "{name} đang nhập…". The dots bounce; under
// prefers-reduced-motion they stay still. The text is the accessible label.
export const TypingIndicator = ({ name }: TypingIndicatorProps) => {
  const t = useTranslations("chat.typing");

  return (
    <div className="mt-3 flex items-center gap-2" role="status">
      <span
        aria-hidden
        className="inline-flex items-center gap-1 rounded-2xl rounded-bl-md bg-line px-3 py-3"
      >
        {DOT_DELAYS_MS.map((delay) => (
          <span
            key={delay}
            style={{ animationDelay: `${delay}ms` }}
            className="size-1.5 animate-bounce rounded-full bg-muted motion-reduce:animate-none"
          />
        ))}
      </span>
      <span className="text-xs text-muted">{t("label", { name })}</span>
    </div>
  );
};

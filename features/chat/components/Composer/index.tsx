"use client";

import clsx from "clsx";
import { ArrowUp } from "lucide-react";
import { type KeyboardEvent, useRef, useState } from "react";

import { CHAT_BODY_MAX_LENGTH } from "@/features/chat/utils/chat-rules";

interface ComposerProps {
  onSend: (body: string) => void;
  placeholder?: string;
}

const MAX_HEIGHT_PX = 120;

// Pill-shaped input. The send arrow only appears with real text. Enter sends
// on desktop (Shift+Enter = new line); on touch devices Enter is a new line
// and the button sends.
export const Composer = ({
  onSend,
  placeholder = "Nhắn tin cho PT…",
}: ComposerProps) => {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const canSend = value.trim().length > 0;

  const resize = () => {
    const input = inputRef.current;

    if (input) {
      input.style.height = "auto";
      input.style.height = `${Math.min(input.scrollHeight, MAX_HEIGHT_PX)}px`;
    }
  };

  const submit = () => {
    if (!canSend) {
      return;
    }
    onSend(value);
    setValue("");
    // The textarea shrinks after React clears it.
    requestAnimationFrame(resize);
    inputRef.current?.focus();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      // Vietnamese IMEs use Enter to confirm a composition.
      !event.nativeEvent.isComposing &&
      window.matchMedia("(pointer: fine)").matches
    ) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      className="mx-3 flex items-end gap-2 rounded-[1.5rem] border border-line bg-surface py-1.5 pr-1.5 pl-4 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/30"
    >
      <textarea
        ref={inputRef}
        value={value}
        rows={1}
        maxLength={CHAT_BODY_MAX_LENGTH}
        placeholder={placeholder}
        aria-label="Nội dung tin nhắn"
        enterKeyHint="enter"
        onChange={(event) => {
          setValue(event.target.value);
          resize();
        }}
        onKeyDown={handleKeyDown}
        className="min-h-8 max-h-[120px] min-w-0 flex-1 resize-none self-center bg-transparent py-1 text-base leading-6 text-fg placeholder:text-muted focus:outline-none"
      />
      <button
        type="submit"
        aria-label="Gửi tin nhắn"
        tabIndex={canSend ? 0 : -1}
        aria-hidden={!canSend}
        className={clsx(
          "inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-accent-fg transition-all duration-150 active:scale-90",
          canSend
            ? "scale-100 opacity-100"
            : "pointer-events-none w-0 scale-50 opacity-0",
        )}
      >
        <ArrowUp className="size-5" strokeWidth={2.5} aria-hidden />
      </button>
    </form>
  );
};

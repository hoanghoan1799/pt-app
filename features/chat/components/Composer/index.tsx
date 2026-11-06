"use client";

import clsx from "clsx";
import { ArrowUp, Smile } from "lucide-react";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";

import { CHAT_BODY_MAX_LENGTH } from "@/features/chat/utils/chat-rules";

interface ComposerProps {
  onSend: (body: string) => void;
  // Called on every edit that leaves text in the box; the owner throttles.
  onTyping?: () => void;
  placeholder?: string;
  // Edit mode: the box is prefilled with the message, sending saves it. The
  // draft typed before is kept and comes back when edit mode ends.
  editing?: { id: number; body: string } | null;
  onSaveEdit?: (body: string) => void;
  // Id of the message being replied to; picking one puts the cursor in the box.
  replyId?: number | null;
  // Shows the sticker button (hidden while editing); the owner opens the panel.
  onOpenStickers?: () => void;
}

const MAX_HEIGHT_PX = 120;

// Pill-shaped input. The send arrow only appears with real text. Enter sends
// on desktop (Shift+Enter = new line); on touch devices Enter is a new line
// and the button sends.
export const Composer = ({
  onSend,
  onTyping,
  placeholder = "Nhắn tin cho PT…",
  editing = null,
  onSaveEdit,
  replyId = null,
  onOpenStickers,
}: ComposerProps) => {
  const [value, setValue] = useState("");
  const [draft, setDraft] = useState("");
  const [seenEditId, setSeenEditId] = useState<number | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const canSend = value.trim().length > 0;
  const editId = editing?.id ?? null;

  // Entering or leaving edit mode swaps the box content (state adjusted while
  // rendering, so there is no frame with the wrong text).
  if (editId !== seenEditId) {
    setSeenEditId(editId);
    if (editing) {
      setDraft(value);
      setValue(editing.body);
    } else {
      setValue(draft);
      setDraft("");
    }
  }

  const resize = () => {
    const input = inputRef.current;

    if (input) {
      input.style.height = "auto";
      input.style.height = `${Math.min(input.scrollHeight, MAX_HEIGHT_PX)}px`;
    }
  };

  useEffect(() => {
    // Wait for the sheet that started the edit or reply to hand focus back.
    const frame = requestAnimationFrame(() => {
      resize();
      if (editId !== null || replyId !== null) {
        inputRef.current?.focus();
      }
    });

    return () => cancelAnimationFrame(frame);
  }, [editId, replyId]);

  const submit = () => {
    if (!canSend) {
      return;
    }
    if (editing && onSaveEdit) {
      // The parent ends edit mode; the draft comes back with it.
      onSaveEdit(value);
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
      className="mx-3 flex items-end gap-1 rounded-[1.5rem] border border-line bg-surface py-1.5 pr-1.5 pl-4 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/30"
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
          if (event.target.value.trim().length > 0) {
            onTyping?.();
          }
          resize();
        }}
        onKeyDown={handleKeyDown}
        className="min-h-8 max-h-[120px] min-w-0 flex-1 resize-none self-center bg-transparent py-1 text-base leading-6 text-fg placeholder:text-muted focus:outline-none"
      />
      {onOpenStickers && !editing && (
        <button
          type="button"
          aria-label="Mở sticker"
          onClick={() => {
            // Keep the keyboard from fighting the sheet.
            inputRef.current?.blur();
            onOpenStickers();
          }}
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-muted transition active:scale-90 active:bg-line"
        >
          <Smile className="size-6" aria-hidden />
        </button>
      )}
      <button
        type="submit"
        aria-label={editing ? "Lưu chỉnh sửa" : "Gửi tin nhắn"}
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

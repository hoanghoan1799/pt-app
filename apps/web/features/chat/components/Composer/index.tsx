"use client";

import clsx from "clsx";
import {
  ArrowUp,
  BellOff,
  ImagePlus,
  type LucideIcon,
  Smile,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { PhotoTray } from "@/features/chat/components/PhotoTray";
import type { PickedSticker } from "@/features/chat/components/StickerPanel";
import { StickerSuggestions } from "@/features/chat/components/StickerSuggestions";
import type { SentPhoto } from "@/features/chat/hooks/use-chat-messages";
import { useMessagePhotos } from "@/features/chat/hooks/use-message-photos";
import { useStickerSuggestSetting } from "@/features/chat/hooks/use-sticker-suggest-setting";
import {
  type ChatCommand,
  composeCommandMessage,
  extractLeadingCommand,
  matchCommandSuggestions,
} from "@/features/chat/utils/chat-commands";
import { CHAT_BODY_MAX_LENGTH } from "@/features/chat/utils/chat-rules";
import {
  MAX_MESSAGE_PHOTOS,
  PHOTO_ERRORS,
} from "@/features/chat/utils/photo-rules";

interface ComposerProps {
  // `photos` are the images picked with the photo button (KAN-160, up to 10),
  // already resized and uploaded; the text is then their optional caption.
  onSend: (body: string, photos?: SentPhoto[]) => void;
  // Shows the photo button (hidden while editing). Needs `uploadPhoto`.
  canAttachPhoto?: boolean;
  // Uploads one resized photo and returns its id (throws with a message).
  uploadPhoto?: (blob: Blob) => Promise<number>;
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
  // Sends a sticker picked from the typing suggestions; the box is cleared.
  // Without it no suggestions are shown.
  onSendSticker?: (sticker: PickedSticker) => void;
}

const MAX_HEIGHT_PX = 120;

const COMMAND_ICONS: Record<string, LucideIcon> = { "bell-off": BellOff };
const SUGGESTIONS_ID = "chat-command-suggestions";

const CommandIcon = ({ command }: { command: ChatCommand }) => {
  const Icon = (command.icon && COMMAND_ICONS[command.icon]) || BellOff;

  return <Icon className="size-4 shrink-0" aria-hidden />;
};

// Pill-shaped input. The send arrow only appears with real text. Enter sends
// on desktop (Shift+Enter = new line); on touch devices Enter is a new line
// and the button sends.
export const Composer = ({
  onSend,
  canAttachPhoto = false,
  uploadPhoto,
  onTyping,
  placeholder,
  editing = null,
  onSaveEdit,
  replyId = null,
  onOpenStickers,
  onSendSticker,
}: ComposerProps) => {
  const t = useTranslations("chat.composer");
  const tTray = useTranslations("chat.photoTray");
  const [value, setValue] = useState("");
  const [draft, setDraft] = useState("");
  const [seenEditId, setSeenEditId] = useState<number | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // The picked photos: each is resized and uploaded as soon as it is picked.
  const photos = useMessagePhotos(
    uploadPhoto ??
      (() => {
        throw new Error(PHOTO_ERRORS.GENERIC);
      }),
  );
  const hasPhotos = photos.items.length > 0;
  // The command picked or typed ("/imlang ") lives outside the text as a chip
  // (Messenger style); it is put back in front of the text on send. Not in
  // edit mode, where the chip is hidden and ignored.
  const [chip, setChip] = useState<ChatCommand | null>(null);
  const [highlight, setHighlight] = useState(0);
  const activeChip = editing ? null : chip;
  const suggestions =
    editing || activeChip ? [] : matchCommandSuggestions(value);
  const active = Math.min(highlight, Math.max(suggestions.length - 1, 0));
  const canSend = value.trim().length > 0 || (hasPhotos && !editing);
  const editId = editing?.id ?? null;
  // Sticker suggestions while typing: the text they were hidden for ("Ẩn" or
  // Escape), and the per-device switches.
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);
  const [suggestStickers] = useStickerSuggestSetting("stickers");
  const [suggestGifs] = useStickerSuggestSetting("gifs");
  const trimmed = value.trim();
  const showStickerSuggestions =
    Boolean(onSendSticker) &&
    suggestStickers &&
    !editing &&
    !activeChip &&
    !hasPhotos &&
    trimmed !== "" &&
    !trimmed.startsWith("/") &&
    dismissedFor !== trimmed;

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
    if (photos.isBlocked) {
      toast.error(tTray("pending"));
      return;
    }
    const sent = photos.ready();

    onSend(
      activeChip ? composeCommandMessage(activeChip, value) : value,
      sent.length > 0 ? sent : undefined,
    );
    photos.reset();
    setValue("");
    setChip(null);
    // The textarea shrinks after React clears it.
    requestAnimationFrame(resize);
    inputRef.current?.focus();
  };

  const pickSticker = (sticker: PickedSticker) => {
    onSendSticker?.(sticker);
    setValue("");
    setDismissedFor(null);
    requestAnimationFrame(resize);
    inputRef.current?.focus();
  };

  const pickCommand = (command: ChatCommand) => {
    setChip(command);
    setValue("");
    setHighlight(0);
    inputRef.current?.focus();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (suggestions.length > 0 && !event.nativeEvent.isComposing) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const step = event.key === "ArrowDown" ? 1 : -1;

        setHighlight((active + step + suggestions.length) % suggestions.length);
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        pickCommand(suggestions[active]);
        return;
      }
    }
    if (event.key === "Escape" && showStickerSuggestions) {
      setDismissedFor(trimmed);
      return;
    }
    if (event.key === "Backspace" && activeChip && value === "") {
      event.preventDefault();
      setChip(null);
      return;
    }
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

  const showPhotoButton = canAttachPhoto && Boolean(uploadPhoto) && !editing;

  return (
    <div>
      {!editing && (
        <PhotoTray photos={photos} onAdd={() => fileRef.current?.click()} />
      )}
      {suggestions.length > 0 && (
        <ul
          id={SUGGESTIONS_ID}
          role="listbox"
          aria-label={t("commandsLabel")}
          className="mx-3 mb-1 flex flex-col gap-0.5 rounded-2xl border border-line bg-surface p-1"
        >
          {suggestions.map((command, index) => (
            <li
              key={command.name}
              id={`${SUGGESTIONS_ID}-${command.name}`}
              role="option"
              aria-selected={index === active}
            >
              <button
                type="button"
                tabIndex={-1}
                // Keep focus (and the keyboard) in the textarea.
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => pickCommand(command)}
                className={clsx(
                  "flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs text-muted active:bg-line",
                  index === active && "bg-line",
                )}
              >
                <span className="text-accent">
                  <CommandIcon command={command} />
                </span>
                <span className="font-semibold text-fg">/{command.name}</span>
                <span className="min-w-0 truncate">{command.hint}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {showStickerSuggestions && (
        <StickerSuggestions
          text={value}
          withGifs={suggestGifs}
          onPick={pickSticker}
          onDismiss={() => {
            setDismissedFor(trimmed);
            inputRef.current?.focus();
          }}
        />
      )}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
        className={clsx(
          "mx-3 flex items-end gap-1 rounded-[1.5rem] border border-line bg-surface py-1.5 pr-1.5 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/30",
          showPhotoButton ? "pl-1.5" : "pl-4",
        )}
      >
        {showPhotoButton && (
          <>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              data-testid="chat-photo-input"
              onChange={(event) => {
                photos.pick(event.target.files);
                // Picking the same file again must fire a change.
                event.target.value = "";
                inputRef.current?.focus();
              }}
            />
            <button
              type="button"
              aria-label={t("attachPhoto")}
              onClick={() =>
                photos.isFull
                  ? toast.error(tTray("slotsFull", { max: MAX_MESSAGE_PHOTOS }))
                  : fileRef.current?.click()
              }
              className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-muted transition active:scale-90 active:bg-line disabled:opacity-50"
            >
              <ImagePlus className="size-6" aria-hidden />
            </button>
          </>
        )}
        {activeChip && (
          <span className="inline-flex shrink-0 items-center gap-1 self-center rounded-full bg-accent/15 py-1 pr-1 pl-2 text-xs font-semibold text-accent">
            <CommandIcon command={activeChip} />/{activeChip.name}
            <button
              type="button"
              aria-label={t("removeCommand", { name: activeChip.name })}
              onClick={() => {
                setChip(null);
                inputRef.current?.focus();
              }}
              className="inline-flex size-4 items-center justify-center rounded-full active:bg-accent/20"
            >
              <X className="size-3" aria-hidden />
            </button>
          </span>
        )}
        <textarea
          ref={inputRef}
          value={value}
          rows={1}
          maxLength={CHAT_BODY_MAX_LENGTH}
          placeholder={
            activeChip
              ? `${activeChip.hint}…`
              : (placeholder ?? t("placeholder"))
          }
          aria-label={t("messageLabel")}
          aria-controls={suggestions.length > 0 ? SUGGESTIONS_ID : undefined}
          aria-activedescendant={
            suggestions.length > 0
              ? `${SUGGESTIONS_ID}-${suggestions[active].name}`
              : undefined
          }
          enterKeyHint="enter"
          onChange={(event) => {
            const typed = event.target.value;
            const leading =
              editing || chip ? null : extractLeadingCommand(typed);

            if (leading) {
              setChip(leading.command);
            }
            setValue(leading ? leading.rest : typed);
            setHighlight(0);
            if (typed.trim().length > 0) {
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
            aria-label={t("openStickers")}
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
          aria-label={editing ? t("saveEdit") : t("send")}
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
    </div>
  );
};

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
import {
  type ChangeEvent,
  type KeyboardEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";

import { Spinner } from "@/components/common/Spinner";
import type { PickedSticker } from "@/features/chat/components/StickerPanel";
import { StickerSuggestions } from "@/features/chat/components/StickerSuggestions";
import { useStickerSuggestSetting } from "@/features/chat/hooks/use-sticker-suggest-setting";
import {
  type ChatCommand,
  composeCommandMessage,
  extractLeadingCommand,
  matchCommandSuggestions,
} from "@/features/chat/utils/chat-commands";
import { CHAT_BODY_MAX_LENGTH } from "@/features/chat/utils/chat-rules";
import {
  encodePhoto,
  PhotoImageError,
  type PreparedPhoto,
} from "@/features/chat/utils/encode-photo";
import { PHOTO_ERRORS } from "@/features/chat/utils/photo-rules";
import { useLocalizeMessage } from "@/i18n/use-localize-message";

interface ComposerProps {
  // `photo` is the resized image picked with the photo button (KAN-160); the
  // text is then its optional caption.
  onSend: (body: string, photo?: PreparedPhoto) => void;
  // Shows the photo button (hidden while editing).
  canAttachPhoto?: boolean;
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
  onTyping,
  placeholder,
  editing = null,
  onSaveEdit,
  replyId = null,
  onOpenStickers,
  onSendSticker,
}: ComposerProps) => {
  const t = useTranslations("chat.composer");
  const localize = useLocalizeMessage();
  const [value, setValue] = useState("");
  const [draft, setDraft] = useState("");
  const [seenEditId, setSeenEditId] = useState<number | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // The picked photo, already resized, with a local URL for the preview.
  const [photo, setPhoto] = useState<{
    prepared: PreparedPhoto;
    previewUrl: string;
  } | null>(null);
  const [isPreparing, setIsPreparing] = useState(false);
  // The command picked or typed ("/imlang ") lives outside the text as a chip
  // (Messenger style); it is put back in front of the text on send. Not in
  // edit mode, where the chip is hidden and ignored.
  const [chip, setChip] = useState<ChatCommand | null>(null);
  const [highlight, setHighlight] = useState(0);
  const activeChip = editing ? null : chip;
  const suggestions =
    editing || activeChip ? [] : matchCommandSuggestions(value);
  const active = Math.min(highlight, Math.max(suggestions.length - 1, 0));
  const canSend =
    !isPreparing && (value.trim().length > 0 || (photo !== null && !editing));
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
    photo === null &&
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

  const clearPhoto = () => {
    setPhoto((current) => {
      if (current) {
        URL.revokeObjectURL(current.previewUrl);
      }
      return null;
    });
  };

  // Leaving the screen frees the preview.
  const photoRef = useRef(photo);

  useEffect(() => {
    photoRef.current = photo;
  });
  useEffect(
    () => () => {
      if (photoRef.current) {
        URL.revokeObjectURL(photoRef.current.previewUrl);
      }
    },
    [],
  );

  const handlePickPhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    // Picking the same file again must fire a change.
    event.target.value = "";
    if (!file) {
      return;
    }
    setIsPreparing(true);
    try {
      const prepared = await encodePhoto(file);

      clearPhoto();
      setPhoto({ prepared, previewUrl: URL.createObjectURL(prepared.blob) });
      inputRef.current?.focus();
    } catch (error) {
      toast.error(
        localize(
          error instanceof PhotoImageError
            ? error.message
            : PHOTO_ERRORS.DECODE_FAILED,
        ),
      );
    } finally {
      setIsPreparing(false);
    }
  };

  const submit = () => {
    if (!canSend) {
      return;
    }
    if (editing && onSaveEdit) {
      // The parent ends edit mode; the draft comes back with it.
      onSaveEdit(value);
      return;
    }
    onSend(
      activeChip ? composeCommandMessage(activeChip, value) : value,
      photo?.prepared,
    );
    clearPhoto();
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

  const showPhotoButton = canAttachPhoto && !editing;

  return (
    <div>
      {(photo || isPreparing) && !editing && (
        <div className="mx-4 mb-2 flex items-center gap-2">
          {photo ? (
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element -- a local blob URL, nothing for next/image to optimise */}
              <img
                src={photo.previewUrl}
                alt={t("photoPreviewAlt")}
                className="size-16 rounded-xl border border-line object-cover"
              />
              <button
                type="button"
                aria-label={t("removePhoto")}
                onClick={clearPhoto}
                className="absolute -top-2 -right-2 inline-flex size-6 items-center justify-center rounded-full bg-fg text-bg shadow active:scale-90"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
          ) : (
            <span
              role="status"
              className="inline-flex items-center gap-2 text-sm text-muted"
            >
              <Spinner size="sm" />
              {t("processingPhoto")}
            </span>
          )}
        </div>
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
              hidden
              data-testid="chat-photo-input"
              onChange={(event) => void handlePickPhoto(event)}
            />
            <button
              type="button"
              aria-label={t("attachPhoto")}
              disabled={isPreparing}
              aria-busy={isPreparing}
              onClick={() => fileRef.current?.click()}
              className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-muted transition active:scale-90 active:bg-line disabled:opacity-50"
            >
              {isPreparing ? (
                <Spinner size="lg" />
              ) : (
                <ImagePlus className="size-6" aria-hidden />
              )}
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

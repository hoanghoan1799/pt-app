"use client";

import clsx from "clsx";
import { Check } from "lucide-react";
import { useState, useTransition } from "react";

import { BottomSheet } from "@/components/common/BottomSheet";
import {
  BUTTON_PRIMARY,
  BUTTON_SECONDARY,
  FIELD_ERROR,
  INPUT,
  SECTION_TITLE,
} from "@/constants/styles";
import { AvatarField } from "@/features/avatar/components/AvatarField";
import {
  adminSetChatColorAction,
  adminSetConversationColorAction,
  adminSetNicknameAction,
  setChatColorAction,
  setNicknameAction,
} from "@/features/chat/services/chat-profile-actions";
import {
  CHAT_PALETTE,
  type ChatColorKey,
  DEFAULT_CHAT_COLOR,
  isChatColorKey,
} from "@/features/chat/utils/chat-palette";
import { CHAT_NICKNAME_MAX_LENGTH } from "@/features/chat/utils/chat-rules";
import {
  canSaveNickname,
  type ChatProfileView,
  isNicknameTooLong,
  nicknameLength,
  type NicknameTarget,
  settingsTargets,
} from "@/features/chat/utils/chat-settings";
import type { ThreadViewer } from "@/features/chat/utils/chat-thread-rules";

const FAILED_TEXT = "Không lưu được. Thử lại nhé.";
const LOCKED_NOTE = "Chat đang khoá nên chưa đổi được biệt danh và màu.";
const ADMIN_LOCKED_NOTE =
  "Chat đang khoá. Biệt danh và màu của cuộc trò chuyện chưa đổi được, màu tài khoản thì vẫn đổi được.";

interface ActionResult {
  status: string;
  message?: string;
  profile?: ChatProfileView;
}

export interface ChatSettingsSheetProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  viewer: ThreadViewer;
  conversationId: number | null;
  // Real names, shown when there is no nickname.
  peerName: string;
  selfName: string;
  profile: ChatProfileView;
  // Admin only: the saved account colour from the server; null = never
  // picked, which shows the default palette colour.
  accountColor?: ChatColorKey | null;
  onProfileChange: (profile: ChatProfileView) => void;
  // Re-fetch the thread (after an account colour change the resolved colours
  // are only known to the server).
  onSync: () => void;
  chatEnabled: boolean;
  // The viewer's own saved photo (versioned URL) and its change callback.
  selfAvatarUrl?: string | null;
  onAvatarChange?: (url: string | null) => void;
}

interface NicknameFieldProps {
  id: string;
  label: string;
  target: NicknameTarget;
  saved: string | undefined;
  disabled: boolean;
  onSave: (target: string, nickname: string) => Promise<string | null>;
}

// One nickname: input with a counter, Save and Clear. The draft restarts
// whenever the saved value changes (the parent keys it on the value).
const NicknameField = ({
  id,
  label,
  target,
  saved,
  disabled,
  onSave,
}: NicknameFieldProps) => {
  const [draft, setDraft] = useState(saved ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const length = nicknameLength(draft.trim());
  const tooLong = isNicknameTooLong(draft);

  const save = (value: string) => {
    setError(null);
    startTransition(async () => {
      setError(await onSave(target.key, value));
    });
  };

  return (
    <div data-nickname-target={target.key}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-fg">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="text"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={target.realName}
          autoComplete="off"
          disabled={disabled || isPending}
          aria-invalid={tooLong}
          aria-describedby={`${id}-count`}
          className={INPUT}
          onKeyDown={(event) => {
            if (event.key === "Enter" && canSaveNickname(draft, saved)) {
              event.preventDefault();
              save(draft);
            }
          }}
        />
        <button
          type="button"
          disabled={disabled || isPending || !canSaveNickname(draft, saved)}
          onClick={() => save(draft)}
          className={clsx(BUTTON_PRIMARY, "shrink-0 px-4")}
        >
          {isPending ? "Đang lưu…" : "Lưu"}
        </button>
      </div>
      <div className="mt-1 flex min-h-9 items-center justify-between gap-3">
        <span
          id={`${id}-count`}
          className={clsx(
            "text-xs",
            tooLong ? "font-semibold text-danger" : "text-muted",
          )}
        >
          {length}/{CHAT_NICKNAME_MAX_LENGTH}
        </span>
        {saved && (
          <button
            type="button"
            disabled={disabled || isPending}
            onClick={() => {
              setDraft("");
              save("");
            }}
            className="inline-flex min-h-9 items-center rounded-lg px-2 text-sm font-medium text-muted transition active:bg-line disabled:opacity-50"
          >
            Xoá biệt danh
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className={FIELD_ERROR}>
          {error}
        </p>
      )}
    </div>
  );
};

interface SwatchesProps {
  name: string;
  label: string;
  selected: ChatColorKey | null;
  disabled: boolean;
  onPick: (color: ChatColorKey) => void;
}

// The 8 palette colours as a radio group; white text on each is AA (D5).
const Swatches = ({
  name,
  label,
  selected,
  disabled,
  onPick,
}: SwatchesProps) => (
  <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2.5">
    {CHAT_PALETTE.map((entry) => {
      const isSelected = entry.key === selected;

      return (
        <button
          key={entry.key}
          type="button"
          role="radio"
          aria-checked={isSelected}
          aria-label={entry.label}
          title={entry.label}
          data-color-option={entry.key}
          data-color-group={name}
          disabled={disabled}
          onClick={() => onPick(entry.key)}
          style={{ backgroundColor: entry.bg }}
          className={clsx(
            "flex size-11 items-center justify-center rounded-full text-white transition active:scale-95 disabled:opacity-40",
            isSelected && "ring-2 ring-fg ring-offset-2 ring-offset-bg",
          )}
        >
          {isSelected && <Check className="size-5" aria-hidden />}
        </button>
      );
    })}
  </div>
);

// Conversation settings (KAN-142, spec D1, D4): nicknames for the other
// person and for yourself, and the bubble colour. An admin can also give
// this conversation its own colour. While the chat is locked everything is
// read-only except the admin's account colour.
export const ChatSettingsSheet = ({
  isOpen,
  onOpenChange,
  viewer,
  conversationId,
  peerName,
  selfName,
  profile,
  accountColor: savedAccountColor = null,
  onProfileChange,
  onSync,
  chatEnabled,
  selfAvatarUrl = null,
  onAvatarChange,
}: ChatSettingsSheetProps) => {
  const isAdmin = viewer.role === "admin";
  const { other, self } = settingsTargets(viewer, { peerName, selfName });
  const [colorError, setColorError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  // The thread payload only has the resolved colour (it may be a
  // per-conversation override), so the saved account colour comes from the
  // server as a prop and is overridden once picked or reset in this session.
  const [pickedAccountColor, setAccountColor] = useState<ChatColorKey | null>(
    null,
  );
  const accountColor =
    pickedAccountColor ?? savedAccountColor ?? DEFAULT_CHAT_COLOR;
  const readOnly = !chatEnabled;
  const ownColorValue = profile.colors[self.key];
  const ownColor = isChatColorKey(ownColorValue)
    ? ownColorValue
    : DEFAULT_CHAT_COLOR;

  const accept = (result: ActionResult): string | null => {
    if (result.status === "success") {
      if (result.profile) {
        onProfileChange(result.profile);
      }
      return null;
    }
    return result.message ?? FAILED_TEXT;
  };

  const run = async (
    call: () => Promise<ActionResult>,
  ): Promise<string | null> => {
    try {
      return accept(await call());
    } catch {
      return FAILED_TEXT;
    }
  };

  const saveNickname = (target: string, nickname: string) =>
    run(() =>
      viewer.role === "admin"
        ? adminSetNicknameAction({
            conversationId: conversationId ?? 0,
            target,
            nickname,
          })
        : setNicknameAction({ target, nickname }),
    );

  const pickColor = (color: ChatColorKey) => {
    setColorError(null);
    startTransition(async () => {
      setColorError(
        await run(() =>
          viewer.role === "admin"
            ? adminSetConversationColorAction({
                conversationId: conversationId ?? 0,
                color,
              })
            : setChatColorAction({ color }),
        ),
      );
    });
  };

  // Back to the account colour: remove the per-conversation override.
  const resetConversationColor = () => {
    setColorError(null);
    startTransition(async () => {
      let resolved: string | undefined;
      const error = await run(async () => {
        const result = await adminSetConversationColorAction({
          conversationId: conversationId ?? 0,
          color: null,
        });

        resolved =
          result.status === "success"
            ? result.profile?.colors[self.key]
            : undefined;
        return result;
      });

      setColorError(error);
      if (!error && isChatColorKey(resolved)) {
        setAccountColor(resolved);
      }
    });
  };

  const pickAccountColor = (color: ChatColorKey) => {
    setColorError(null);
    startTransition(async () => {
      const error = await run(() => adminSetChatColorAction({ color }));

      setColorError(error);
      if (!error) {
        setAccountColor(color);
        onSync();
      }
    });
  };

  return (
    <BottomSheet
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title="Cài đặt cuộc trò chuyện"
      description="Biệt danh và màu tin nhắn"
    >
      <div data-chat-settings className="space-y-6">
        {readOnly && (
          <p
            role="status"
            className="rounded-xl border border-line bg-surface px-3 py-2 text-sm text-muted"
          >
            {isAdmin ? ADMIN_LOCKED_NOTE : LOCKED_NOTE}
          </p>
        )}

        <section className="space-y-3">
          <h3 className={SECTION_TITLE}>Ảnh đại diện</h3>
          <p className="text-sm text-muted">
            Ảnh của bạn hiện ở đầu cuộc trò chuyện và cạnh tin nhắn của bạn.
          </p>
          <AvatarField
            role={viewer.role}
            name={selfName}
            savedUrl={selfAvatarUrl}
            onSaved={(url) => onAvatarChange?.(url)}
          />
        </section>

        <section className="space-y-4">
          <h3 className={SECTION_TITLE}>Biệt danh</h3>
          <NicknameField
            key={`${other.key}:${profile.nicknames[other.key] ?? ""}`}
            id="chat-nickname-other"
            label={`Biệt danh của ${other.realName}`}
            target={other}
            saved={profile.nicknames[other.key]}
            disabled={readOnly}
            onSave={saveNickname}
          />
          <NicknameField
            key={`${self.key}:${profile.nicknames[self.key] ?? ""}`}
            id="chat-nickname-self"
            label="Biệt danh của bạn"
            target={self}
            saved={profile.nicknames[self.key]}
            disabled={readOnly}
            onSave={saveNickname}
          />
        </section>

        <section className="space-y-3">
          <h3 className={SECTION_TITLE}>
            {isAdmin ? "Màu cho cuộc trò chuyện này" : "Màu tin nhắn của bạn"}
          </h3>
          <p className="text-sm text-muted">
            {isAdmin
              ? "Chỉ áp dụng cho cuộc trò chuyện này, thay cho màu tài khoản."
              : "Tin nhắn của bạn hiện màu này ở cả hai bên."}
          </p>
          <Swatches
            name="conversation"
            label={isAdmin ? "Màu cho cuộc trò chuyện này" : "Màu tin nhắn"}
            selected={ownColor}
            disabled={readOnly || isPending}
            onPick={pickColor}
          />
          {isAdmin && (
            <button
              type="button"
              disabled={readOnly || isPending}
              onClick={resetConversationColor}
              className={clsx(BUTTON_SECONDARY, "min-h-10 px-4 text-sm")}
            >
              Dùng màu tài khoản
            </button>
          )}
        </section>

        {isAdmin && (
          <section className="space-y-3">
            <h3 className={SECTION_TITLE}>Màu tài khoản của bạn</h3>
            <p className="text-sm text-muted">
              Dùng cho mọi cuộc trò chuyện chưa chọn màu riêng.
            </p>
            <Swatches
              name="account"
              label="Màu tài khoản"
              selected={accountColor}
              disabled={isPending}
              onPick={pickAccountColor}
            />
          </section>
        )}

        {colorError && (
          <p role="alert" className={FIELD_ERROR}>
            {colorError}
          </p>
        )}
      </div>
    </BottomSheet>
  );
};

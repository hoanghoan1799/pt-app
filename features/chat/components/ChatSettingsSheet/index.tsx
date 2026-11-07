"use client";

import clsx from "clsx";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import { Avatar } from "@/components/common/Avatar";
import { AvatarLightbox } from "@/components/common/AvatarLightbox";
import { BottomSheet } from "@/components/common/BottomSheet";
import { ROUTES } from "@/constants/routes";
import {
  BUTTON_PRIMARY,
  BUTTON_SECONDARY,
  FIELD_ERROR,
  INPUT,
  SECTION_TITLE,
} from "@/constants/styles";
import { ColorSwatches } from "@/features/chat/components/ColorSwatches";
import {
  hideConversationsAction,
  isConversationHiddenAction,
  unhideConversationAction,
} from "@/features/chat/services/chat-hidden-actions";
import {
  adminSetConversationColorAction,
  adminSetNicknameAction,
  setChatColorAction,
  setNicknameAction,
} from "@/features/chat/services/chat-profile-actions";
import {
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
  "Chat đang khoá. Biệt danh và màu của cuộc trò chuyện chưa đổi được.";

interface ActionResult {
  status: string;
  message?: string;
  profile?: ChatProfileView;
}

// Admin only: hide this chat from the inbox or bring it back (KAN-164).
const HideConversationSection = ({
  isOpen,
  conversationId,
  onClose,
}: {
  isOpen: boolean;
  conversationId: number | null;
  onClose: () => void;
}) => {
  const router = useRouter();
  const [isHidden, setIsHidden] = useState<boolean | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!isOpen || conversationId === null) {
      return;
    }
    let cancelled = false;

    isConversationHiddenAction(conversationId)
      .then((result) => {
        if (!cancelled && result.status === "success" && "hidden" in result) {
          setIsHidden(result.hidden);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [isOpen, conversationId]);

  if (conversationId === null || isHidden === null) {
    return null;
  }

  const toggle = () => {
    startTransition(async () => {
      try {
        const result = isHidden
          ? await unhideConversationAction(conversationId)
          : await hideConversationsAction([conversationId]);

        if (result.status !== "success") {
          toast.error(result.message ?? FAILED_TEXT);
          return;
        }
        if (isHidden) {
          setIsHidden(false);
          toast.success("Đã bỏ ẩn học viên");
          router.refresh();
          return;
        }
        toast.success("Đã ẩn 1 học viên");
        onClose();
        router.push(ROUTES.ADMIN_MESSAGES);
      } catch {
        toast.error(FAILED_TEXT);
      }
    });
  };

  return (
    <section className="space-y-3">
      <button
        type="button"
        disabled={isPending}
        onClick={toggle}
        className={clsx(BUTTON_SECONDARY, "w-full")}
      >
        {isHidden ? "Bỏ ẩn học viên" : "Ẩn học viên"}
      </button>
    </section>
  );
};

export interface ChatSettingsSheetProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  viewer: ThreadViewer;
  conversationId: number | null;
  // Real names, shown when there is no nickname.
  peerName: string;
  selfName: string;
  profile: ChatProfileView;
  onProfileChange: (profile: ChatProfileView) => void;
  chatEnabled: boolean;
  // The other person's photo (versioned URL) or null for initials.
  peerAvatarUrl?: string | null;
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

// Conversation settings (KAN-142, spec D1, D4): nicknames for the other
// person and for yourself, and the bubble colour. An admin can also give
// this conversation its own colour. While the chat is locked everything is
// read-only. The top shows the other person's photo, enlargeable.
export const ChatSettingsSheet = ({
  isOpen,
  onOpenChange,
  viewer,
  conversationId,
  peerName,
  selfName,
  profile,
  onProfileChange,
  chatEnabled,
  peerAvatarUrl = null,
}: ChatSettingsSheetProps) => {
  const isAdmin = viewer.role === "admin";
  const { other, self } = settingsTargets(viewer, { peerName, selfName });
  const [colorError, setColorError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isPhotoOpen, setIsPhotoOpen] = useState(false);
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
      setColorError(
        await run(() =>
          adminSetConversationColorAction({
            conversationId: conversationId ?? 0,
            color: null,
          }),
        ),
      );
    });
  };

  return (
    <BottomSheet
      isOpen={isOpen}
      // The photo viewer sits above the sheet; a tap in it is not a tap
      // outside the sheet.
      onOpenChange={(next) => {
        if (next || !isPhotoOpen) {
          onOpenChange(next);
        }
      }}
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

        <section
          aria-label="Ảnh đại diện"
          className="flex flex-col items-center gap-2"
        >
          {peerAvatarUrl ? (
            <button
              type="button"
              onClick={() => setIsPhotoOpen(true)}
              aria-label={`Xem ảnh của ${peerName}`}
              className="rounded-full transition active:scale-95"
            >
              <Avatar
                name={peerName}
                src={peerAvatarUrl}
                className="size-24 text-3xl"
              />
            </button>
          ) : (
            <Avatar name={peerName} className="size-24 text-3xl" />
          )}
          <p className="text-base font-semibold text-fg">{peerName}</p>
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
          <ColorSwatches
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

        {colorError && (
          <p role="alert" className={FIELD_ERROR}>
            {colorError}
          </p>
        )}

        {isAdmin && (
          <HideConversationSection
            isOpen={isOpen}
            conversationId={conversationId}
            onClose={() => onOpenChange(false)}
          />
        )}
      </div>
      {peerAvatarUrl && (
        <AvatarLightbox
          isOpen={isPhotoOpen}
          onClose={() => setIsPhotoOpen(false)}
          src={peerAvatarUrl}
          name={peerName}
        />
      )}
    </BottomSheet>
  );
};

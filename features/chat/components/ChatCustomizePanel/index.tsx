"use client";

import clsx from "clsx";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import {
  BUTTON_PRIMARY,
  BUTTON_SECONDARY,
  FIELD_ERROR,
  INPUT,
  SECTION_TITLE,
} from "@/constants/styles";
import { ColorSwatches } from "@/features/chat/components/ColorSwatches";
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

interface ActionResult {
  status: string;
  message?: string;
  profile?: ChatProfileView;
}

export interface ChatCustomizePanelProps {
  viewer: ThreadViewer;
  conversationId: number | null;
  // Real names, shown when there is no nickname.
  peerName: string;
  selfName: string;
  profile: ChatProfileView;
  onProfileChange: (profile: ChatProfileView) => void;
  chatEnabled: boolean;
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
  const t = useTranslations("chat.customize");
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
          {isPending ? t("saving") : t("save")}
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
            {t("clearNickname")}
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

// The old conversation settings sheet (KAN-142, spec D1, D4), now the
// "Tuỳ chỉnh" panel of the chat info page: nicknames for the other person and
// for yourself, and the bubble colour. An admin can also give this
// conversation its own colour. While the chat is locked everything is
// read-only.
export const ChatCustomizePanel = ({
  viewer,
  conversationId,
  peerName,
  selfName,
  profile,
  onProfileChange,
  chatEnabled,
}: ChatCustomizePanelProps) => {
  const t = useTranslations("chat.customize");
  const isAdmin = viewer.role === "admin";
  const { other, self } = settingsTargets(viewer, { peerName, selfName });
  const [colorError, setColorError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
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
    return result.message ?? t("failed");
  };

  const run = async (
    call: () => Promise<ActionResult>,
  ): Promise<string | null> => {
    try {
      return accept(await call());
    } catch {
      return t("failed");
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
    <div data-chat-settings className="space-y-6">
      {readOnly && (
        <p
          role="status"
          className="rounded-xl border border-line bg-surface px-3 py-2 text-sm text-muted"
        >
          {isAdmin ? t("lockedAdmin") : t("locked")}
        </p>
      )}

      <section className="space-y-4">
        <h3 className={SECTION_TITLE}>{t("nicknameSection")}</h3>
        <NicknameField
          key={`${other.key}:${profile.nicknames[other.key] ?? ""}`}
          id="chat-nickname-other"
          label={t("nicknameOf", { name: other.realName })}
          target={other}
          saved={profile.nicknames[other.key]}
          disabled={readOnly}
          onSave={saveNickname}
        />
        <NicknameField
          key={`${self.key}:${profile.nicknames[self.key] ?? ""}`}
          id="chat-nickname-self"
          label={t("nicknameSelf")}
          target={self}
          saved={profile.nicknames[self.key]}
          disabled={readOnly}
          onSave={saveNickname}
        />
      </section>

      <section className="space-y-3">
        <h3 className={SECTION_TITLE}>
          {isAdmin ? t("colorConversation") : t("colorOwn")}
        </h3>
        <p className="text-sm text-muted">
          {isAdmin ? t("colorAdminHint") : t("colorUserHint")}
        </p>
        <ColorSwatches
          name="conversation"
          label={isAdmin ? t("colorConversation") : t("colorLabel")}
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
            {t("useAccountColor")}
          </button>
        )}
      </section>

      {colorError && (
        <p role="alert" className={FIELD_ERROR}>
          {colorError}
        </p>
      )}
    </div>
  );
};

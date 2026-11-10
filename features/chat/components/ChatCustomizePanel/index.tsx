"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { Spinner } from "@/components/common/Spinner";
import {
  BUTTON_SECONDARY,
  FIELD_ERROR,
  SECTION_TITLE,
} from "@/constants/styles";
import { ColorSwatches } from "@/features/chat/components/ColorSwatches";
import {
  adminSetConversationColorAction,
  setChatColorAction,
} from "@/features/chat/services/chat-profile-actions";
import {
  type ChatColorKey,
  DEFAULT_CHAT_COLOR,
  isChatColorKey,
} from "@/features/chat/utils/chat-palette";
import {
  type ChatProfileView,
  settingsTargets,
} from "@/features/chat/utils/chat-settings";
import type { ThreadViewer } from "@/features/chat/utils/chat-thread-rules";
import { AliasField } from "@/features/contact-aliases/components/AliasField";
import {
  adminSetContactAliasAction,
  setContactAliasAction,
} from "@/features/contact-aliases/services/contact-alias-actions";
import { conversationKeyToTarget } from "@/features/contact-aliases/utils/alias-rules";
import { cn } from "@/utils/cn";

interface ActionResult {
  status: string;
  message?: string;
  profile?: ChatProfileView;
}

export interface ChatCustomizePanelProps {
  viewer: ThreadViewer;
  // The trainee of this conversation (either side's page knows it).
  traineeUserId: number;
  conversationId: number | null;
  // The other person's real name, shown when there is no nickname.
  peerName: string;
  profile: ChatProfileView;
  onProfileChange: (profile: ChatProfileView) => void;
  chatEnabled: boolean;
}

// The old conversation settings sheet (KAN-142, spec D1, D4), now the
// "Tuỳ chỉnh" panel of the chat info page: a private nickname for the other
// person (only you see it) and the bubble colour. An admin can also give this
// conversation its own colour. While the chat is locked the colours are
// read-only; a private nickname stays editable (it changes nobody else's view).
export const ChatCustomizePanel = ({
  viewer,
  traineeUserId,
  conversationId,
  peerName,
  profile,
  onProfileChange,
  chatEnabled,
}: ChatCustomizePanelProps) => {
  const t = useTranslations("chat.customize");
  const isAdmin = viewer.role === "admin";
  const { other, self } = settingsTargets(viewer, { peerName });
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

  // The nickname is private to this viewer, so it is not tied to the chat
  // lock and nothing is broadcast; only this screen's copy is updated.
  const saveNickname = async (_targetKey: string, alias: string) => {
    try {
      const targetKey = conversationKeyToTarget(other.key, traineeUserId);
      const result = await (
        viewer.role === "admin"
          ? adminSetContactAliasAction
          : setContactAliasAction
      )({ targetKey, alias });

      if (result.status !== "success") {
        return result.message ?? t("failed");
      }
      const nicknames = { ...profile.nicknames };

      if (result.alias) {
        nicknames[other.key] = result.alias;
      } else {
        delete nicknames[other.key];
      }
      onProfileChange({ ...profile, nicknames });
      return null;
    } catch {
      return t("failed");
    }
  };

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
        <AliasField
          key={`${other.key}:${profile.nicknames[other.key] ?? ""}`}
          id="chat-nickname-other"
          label={t("nicknameOf", { name: peerName })}
          targetKey={other.key}
          realName={peerName}
          saved={profile.nicknames[other.key]}
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
          isPending={isPending}
          onPick={pickColor}
        />
        {isAdmin && (
          <button
            type="button"
            disabled={readOnly || isPending}
            aria-busy={isPending}
            onClick={resetConversationColor}
            className={cn(BUTTON_SECONDARY, "min-h-10 px-4 text-sm")}
          >
            {isPending && <Spinner size="sm" />}
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

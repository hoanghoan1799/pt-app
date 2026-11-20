"use client";

import clsx from "clsx";
import { EyeOff } from "lucide-react";
import dynamic from "next/dynamic";
import { useLocale, useTranslations } from "next-intl";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";

import { useConfirm } from "@/components/common/ConfirmDialog/use-confirm";
import { ScrollJumpButton } from "@/components/common/ScrollJumpButton";
import { Spinner } from "@/components/common/Spinner";
import { ChatHeader } from "@/features/chat/components/ChatHeader";
import { Composer } from "@/features/chat/components/Composer";
import { LockedBanner } from "@/features/chat/components/LockedBanner";
import { MessageBubble } from "@/features/chat/components/MessageBubble";
import { ReplyBar } from "@/features/chat/components/ReplyBar";
import {
  type SentPhoto,
  type ThreadSnapshot,
  useChatMessages,
} from "@/features/chat/hooks/use-chat-messages";
import { useChatTransport } from "@/features/chat/hooks/use-chat-transport";
import { useClearNotifications } from "@/features/chat/hooks/use-clear-notifications";
import {
  buildThreadItems,
  firstStoredId,
  isNearBottom,
  markUnsentQuotes,
  myReactionOf,
  photosOf,
  quoteText,
  senderLabel,
  type ThreadMessage,
} from "@/features/chat/utils/chat-thread-rules";
import { groupNotificationTags } from "@/features/chat/utils/clear-notifications";
import { useVisualViewport } from "@/features/chat-bubbles/hooks/use-visual-viewport";
import { GroupSystemLine } from "@/features/chat-groups/components/GroupSystemLine";
import { SeenBySheet } from "@/features/chat-groups/components/SeenBySheet";
import { useGroupChatAdapter } from "@/features/chat-groups/hooks/use-group-chat-adapter";
import { hideGroupMessageAction } from "@/features/chat-groups/services/group-actions";
import {
  type GroupApiRole,
  groupRoutes,
} from "@/features/chat-groups/utils/group-adapter-urls";
import {
  type GroupState,
  groupViewer,
} from "@/features/chat-groups/utils/group-thread-map";
import { useScrollAway } from "@/hooks/use-scroll-away";
import { useLocalizeMessage } from "@/i18n/use-localize-message";
import { scrollBehaviorFor } from "@/utils/scroll-rules";

export interface GroupThreadProps {
  groupId: number;
  groupName: string;
  // Signed group photo URL, or null for initials.
  avatarSrc: string | null;
  // Which cookie the routes serve: admins pass "admin".
  role: GroupApiRole;
  // Admin or trainee id, for the realtime connection.
  viewerId: number;
  // "admin:<id>" | "user:<id>" and the name optimistic bubbles show.
  viewerKey: string;
  viewerName: string;
  // Super admin or the creator PT: may hide and unhide messages.
  canManage: boolean;
  // Super admin: sees the PT-change alert and its buttons, reports nothing.
  canResolveAlert: boolean;
  // The group's switches and the person's own block at page load; every
  // fetched payload updates them.
  initialState: GroupState;
  initial: ThreadSnapshot;
  backHref: string;
  infoHref: string;
}

// The banner that replaces the composer: the group state first (it applies to
// everyone), then what only this trainee's account causes.
const lockedKey = ({
  dissolved,
  managersOnly,
  isManager,
  lockReason,
}: GroupState) => {
  if (dissolved) {
    return "thread.dissolvedBanner";
  }
  if (managersOnly && !isManager) {
    return "thread.managersOnlyBanner";
  }
  if (lockReason === "chat_off") {
    return "thread.chatOffBanner";
  }
  if (lockReason === "restricted") {
    return "thread.restrictedBanner";
  }
  return "thread.managersOnlyBanner";
};

const HEART = "❤️";
const HIGHLIGHT_MS = 1500;
const NO_NICKNAMES: Readonly<Record<string, string>> = {};

const StickerPanel = dynamic(
  () =>
    import("@/features/chat/components/StickerPanel").then(
      (module) => module.StickerPanel,
    ),
  { ssr: false },
);
const MessageActionsSheet = dynamic(
  () =>
    import("@/features/chat/components/MessageActionsSheet").then(
      (module) => module.MessageActionsSheet,
    ),
  { ssr: false },
);
const EditHistorySheet = dynamic(
  () =>
    import("@/features/chat/components/EditHistorySheet").then(
      (module) => module.EditHistorySheet,
    ),
  { ssr: false },
);
const BottomSheet = dynamic(
  () =>
    import("@/components/common/BottomSheet").then(
      (module) => module.BottomSheet,
    ),
  { ssr: false },
);

type SheetKind = "actions" | "history" | "seen" | "hidden";

const SHEET_ROW =
  "flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-base font-medium text-fg transition active:bg-line";

// The group conversation: the shared message list, composer and sheets over a
// group adapter. Sides and names follow the sender key, system lines sit
// between bubbles, managers get hide / unhide, super admins the PT-change
// alert. The coach chat's ChatThread stays untouched (company plan fallback:
// a separate wrapper instead of widening that component further).
export const GroupThread = ({
  groupId,
  groupName,
  avatarSrc,
  role,
  viewerId,
  viewerKey,
  viewerName,
  canManage,
  canResolveAlert,
  initialState,
  initial,
  backHref,
  infoHref,
}: GroupThreadProps) => {
  const locale = useLocale();
  const t = useTranslations("chatGroups");
  const tThread = useTranslations("chat.chatThread");
  const tJump = useTranslations("common.scrollJump");
  const localize = useLocalizeMessage();
  const confirm = useConfirm();
  const [isVisible, setIsVisible] = useState(true);
  const [groupState, setGroupState] = useState(initialState);
  const viewer = useMemo(
    () => groupViewer(viewerKey, viewerName),
    [viewerKey, viewerName],
  );
  const adapter = useGroupChatAdapter({
    groupId,
    role,
    viewer,
    onGroupState: setGroupState,
  });
  const chat = useChatMessages({ adapter, initial, isViewing: isVisible });
  const { messages, hasMore, chatEnabled, sync } = chat;

  // Reading the group closes its notification (one per group).
  useClearNotifications(groupNotificationTags(groupId), messages.at(-1)?.id);
  const viewport = useVisualViewport();
  const scroller = useRef<HTMLDivElement>(null);
  const wasNearBottom = useRef(true);
  const lastItemKey = useRef<string | null | undefined>(undefined);
  const olderAnchor = useRef<{ height: number; firstId: number | null } | null>(
    null,
  );
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showNewChip, setShowNewChip] = useState(false);
  const [newCount, setNewCount] = useState(0);
  const { isAway } = useScrollAway({ edge: "bottom", container: scroller });
  const [sheet, setSheet] = useState<{ kind: SheetKind; id: number } | null>(
    null,
  );
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [replyId, setReplyId] = useState<number | null>(null);
  const [editing, setEditing] = useState<{ id: number; body: string } | null>(
    null,
  );
  const [highlightId, setHighlightId] = useState<number | null>(null);
  const [isStickerOpen, setIsStickerOpen] = useState(false);
  const [hasStickerPanel, setHasStickerPanel] = useState(false);
  const routes = useMemo(() => groupRoutes(groupId, role), [groupId, role]);

  useChatTransport({
    role,
    userId: viewerId,
    conversationId: null,
    groupId,
    chatEnabled: true,
    onSync: sync,
  });

  useEffect(() => {
    const onChange = () => setIsVisible(document.visibilityState === "visible");

    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);

  const items = useMemo(
    () =>
      buildThreadItems(
        markUnsentQuotes(messages),
        0,
        // eslint-disable-next-line react-hooks/purity
        Date.now(),
        adapter.viewer,
        NO_NICKNAMES,
        locale,
      ),
    [messages, adapter.viewer, locale],
  );

  const scrollToBottom = useCallback((smooth: boolean) => {
    const node = scroller.current;

    if (node) {
      const reduceMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;

      node.scrollTo({
        top: node.scrollHeight,
        behavior: smooth ? scrollBehaviorFor(reduceMotion) : "auto",
      });
    }
  }, []);

  useLayoutEffect(() => {
    scrollToBottom(false);
  }, [scrollToBottom]);

  // A new line at the end: follow when the reader is near the bottom or wrote
  // it; otherwise offer the chip.
  const last = messages[messages.length - 1];
  const lastKey = last
    ? last.id === null
      ? last.clientId
      : String(last.id)
    : null;

  useLayoutEffect(() => {
    if (lastKey === lastItemKey.current) {
      return;
    }
    const isFirstRun = lastItemKey.current === undefined;

    lastItemKey.current = lastKey;
    if (isFirstRun || !last) {
      return;
    }
    if (wasNearBottom.current || last.senderKey === viewerKey) {
      scrollToBottom(true);
    } else {
      setShowNewChip(true);
      setNewCount((count) => count + 1);
    }
  }, [lastKey, last, viewerKey, scrollToBottom]);

  // Older messages were prepended: keep what the reader was looking at.
  const firstId = firstStoredId(messages);

  useLayoutEffect(() => {
    const anchor = olderAnchor.current;
    const node = scroller.current;

    if (anchor && node && firstId !== anchor.firstId) {
      node.scrollTop += node.scrollHeight - anchor.height;
      olderAnchor.current = null;
    }
  }, [firstId]);

  const viewportHeight = viewport?.height;

  useLayoutEffect(() => {
    if (wasNearBottom.current) {
      scrollToBottom(false);
    }
  }, [viewportHeight, scrollToBottom]);

  useEffect(
    () => () => {
      if (highlightTimer.current !== null) {
        clearTimeout(highlightTimer.current);
      }
    },
    [],
  );

  const findMessage = useCallback(
    (id: number | null) =>
      id === null ? undefined : messages.find((message) => message.id === id),
    [messages],
  );
  const sheetMessage = findMessage(sheet?.id ?? null);
  const replyMessage = findMessage(replyId);
  const activeEditing =
    editing && findMessage(editing.id)?.deleted === false ? editing : null;
  const hasComposerBar =
    chatEnabled && (replyMessage !== undefined || activeEditing !== null);

  useLayoutEffect(() => {
    if (wasNearBottom.current) {
      scrollToBottom(false);
    }
  }, [hasComposerBar, scrollToBottom]);

  const openSheet = (kind: SheetKind, message: ThreadMessage) => {
    if (message.id === null) {
      return;
    }
    setSheet({ kind, id: message.id });
    setIsSheetOpen(true);
  };

  const openActions = (message: ThreadMessage) => {
    if (message.deleted) {
      return;
    }
    if (message.hidden) {
      // Nothing to copy or react to; a manager can bring it back.
      if (canManage) {
        openSheet("hidden", message);
      }
      return;
    }
    if (chatEnabled || !message.sticker) {
      openSheet("actions", message);
    }
  };

  const toggleHeart = (message: ThreadMessage) => {
    if (
      !chatEnabled ||
      message.id === null ||
      message.deleted ||
      message.hidden
    ) {
      return;
    }
    void chat.react(
      message.id,
      myReactionOf(message, adapter.viewer) === HEART ? null : HEART,
    );
  };

  const handleCopy = async (message: ThreadMessage) => {
    setIsSheetOpen(false);
    try {
      await navigator.clipboard.writeText(message.body);
      toast.success(tThread("copied"));
    } catch {
      toast.error(tThread("copyFailed"));
    }
  };

  const handleUnsend = async (message: ThreadMessage) => {
    const id = message.id;

    setIsSheetOpen(false);
    if (id === null) {
      return;
    }
    const isConfirmed = await confirm({
      title: tThread("unsendTitle"),
      description: tThread("unsendDescription"),
      confirmLabel: tThread("unsend"),
      isDanger: true,
    });

    if (!isConfirmed) {
      return;
    }
    setEditing((current) => (current?.id === id ? null : current));
    setReplyId((current) => (current === id ? null : current));
    void chat.unsend(id);
  };

  const handleHide = async (message: ThreadMessage, hidden: boolean) => {
    setIsSheetOpen(false);
    if (message.id === null) {
      return;
    }
    try {
      const result = await hideGroupMessageAction({
        groupId,
        messageId: message.id,
        hidden,
      });

      if (result.status === "error") {
        toast.error(localize(result.message));
        return;
      }
      void sync();
    } catch {
      toast.error(t("thread.actionFailed"));
    }
  };

  const jumpToMessage = (id: number) => {
    const node = scroller.current?.querySelector(`[data-message-id="${id}"]`);

    if (!node) {
      return;
    }
    wasNearBottom.current = false;
    node.scrollIntoView({ block: "center", behavior: "smooth" });
    setHighlightId(id);
    if (highlightTimer.current !== null) {
      clearTimeout(highlightTimer.current);
    }
    highlightTimer.current = setTimeout(() => {
      highlightTimer.current = null;
      setHighlightId(null);
    }, HIGHLIGHT_MS);
  };

  const handleSend = (body: string, photos?: SentPhoto[]) => {
    const reply = replyMessage;

    if (photos) {
      chat.sendPhotos(photos, body, reply);
    } else {
      chat.send(body, reply);
    }
    setReplyId(null);
  };

  const handleStickerPick = (
    sticker: Parameters<typeof chat.sendSticker>[0],
  ) => {
    chat.sendSticker(sticker, replyMessage);
    setReplyId(null);
  };

  const handleScroll = () => {
    const node = scroller.current;

    if (!node) {
      return;
    }
    wasNearBottom.current = isNearBottom(
      node.scrollHeight,
      node.scrollTop,
      node.clientHeight,
    );
    if (wasNearBottom.current) {
      setShowNewChip(false);
      setNewCount(0);
    }
  };

  const handleLoadOlder = () => {
    const node = scroller.current;

    if (node) {
      olderAnchor.current = { height: node.scrollHeight, firstId };
    }
    void chat.loadOlder();
  };

  const hideLabel = (message: ThreadMessage) =>
    message.hidden ? t("thread.unhide") : t("thread.hide");

  return (
    <div
      className="fixed inset-x-0 top-0 z-20 flex flex-col bg-bg"
      style={
        viewport
          ? {
              height: viewport.height,
              transform: `translateY(${viewport.offsetTop}px)`,
            }
          : { height: "100dvh" }
      }
    >
      <ChatHeader
        name={groupName}
        title={groupName}
        backHref={backHref}
        avatarSrc={avatarSrc}
        presence={null}
        infoHref={infoHref}
        settingsLabel={t("thread.infoLabel")}
      />
      <div className="relative min-h-0 flex-1">
        <div
          ref={scroller}
          onScroll={handleScroll}
          className="h-full overflow-y-auto overscroll-contain px-4 pb-3"
        >
          <div className="mx-auto w-full max-w-lg">
            {hasMore && (
              <div className="flex justify-center pt-4">
                <button
                  type="button"
                  onClick={handleLoadOlder}
                  disabled={chat.isLoadingOlder}
                  className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-4 py-2 text-sm font-medium text-muted transition active:bg-line disabled:opacity-50"
                >
                  {chat.isLoadingOlder && <Spinner size="sm" />}
                  {chat.isLoadingOlder
                    ? tThread("loadingOlder")
                    : tThread("loadOlder")}
                </button>
              </div>
            )}
            {items.length === 0 && (
              <p className="px-6 py-16 text-center text-sm text-muted">
                {t("thread.empty")}
              </p>
            )}
            <div
              role="log"
              aria-live="polite"
              aria-label={t("thread.ariaLabel", { name: groupName })}
            >
              {items.map((item) => {
                if (item.kind === "message") {
                  return (
                    <MessageBubble
                      key={item.key}
                      item={item}
                      viewer={adapter.viewer}
                      onRetry={chat.retry}
                      nicknames={NO_NICKNAMES}
                      isHighlighted={
                        item.message.id !== null &&
                        item.message.id === highlightId
                      }
                      onOpenActions={openActions}
                      onToggleHeart={toggleHeart}
                      onOpenReactors={openActions}
                      onOpenHistory={(message) => openSheet("history", message)}
                      onOpenSeenBy={(message) => openSheet("seen", message)}
                      onJumpToReply={jumpToMessage}
                    />
                  );
                }
                if (item.kind === "system") {
                  return (
                    <GroupSystemLine
                      key={item.key}
                      groupId={groupId}
                      messageId={item.message.id}
                      event={item.message.systemEvent ?? null}
                      eventNames={item.message.eventNames ?? {}}
                      canResolveAlert={canResolveAlert}
                      onChanged={() => void sync()}
                    />
                  );
                }
                return (
                  <p
                    key={item.key}
                    className={clsx(
                      "text-center text-xs font-medium text-muted",
                      item.kind === "day" ? "mt-5 mb-1" : "mt-4 mb-1",
                    )}
                  >
                    {item.label}
                  </p>
                );
              })}
            </div>
          </div>
        </div>
        <ScrollJumpButton
          direction="down"
          visible={showNewChip || isAway}
          label={
            newCount > 0
              ? tJump("newCount", { count: newCount })
              : tJump("toLatest")
          }
          count={newCount}
          onClick={() => scrollToBottom(true)}
          className="absolute bottom-2 left-1/2 -translate-x-1/2"
        />
      </div>
      <div
        className={clsx(
          "mx-auto w-full max-w-lg shrink-0 pt-2",
          "pb-[calc(env(safe-area-inset-bottom)+0.5rem)]",
        )}
      >
        {chat.sendError && (
          <p role="alert" className="mx-4 mb-2 text-sm text-danger">
            {chat.sendError}
          </p>
        )}
        {chatEnabled && activeEditing && (
          <ReplyBar
            title={tThread("editing")}
            snippet={activeEditing.body}
            closeLabel={tThread("cancelEdit")}
            onClose={() => setEditing(null)}
          />
        )}
        {chatEnabled && !activeEditing && replyMessage && (
          <ReplyBar
            title={tThread("replying", {
              name: senderLabel(replyMessage, adapter.viewer, {}, locale),
            })}
            snippet={quoteText(
              {
                deleted: replyMessage.deleted,
                isSticker: Boolean(replyMessage.sticker),
                isPhoto: Boolean(replyMessage.photo),
                photoCount: photosOf(replyMessage).length,
                body: replyMessage.body,
              },
              locale,
            )}
            closeLabel={tThread("cancelReply")}
            onClose={() => setReplyId(null)}
          />
        )}
        {chatEnabled ? (
          <Composer
            onSend={handleSend}
            canAttachPhoto
            uploadPhoto={chat.uploadPhoto}
            editing={activeEditing}
            onSaveEdit={(body) => {
              if (activeEditing) {
                void chat.edit(activeEditing.id, body);
              }
              setEditing(null);
            }}
            replyId={replyMessage?.id ?? null}
            onOpenStickers={() => {
              setHasStickerPanel(true);
              setIsStickerOpen(true);
            }}
            onSendSticker={handleStickerPick}
            placeholder={t("thread.placeholder")}
          />
        ) : (
          <LockedBanner text={t(lockedKey(groupState))} />
        )}
      </div>
      {hasStickerPanel && chatEnabled && (
        <StickerPanel
          isOpen={isStickerOpen}
          onOpenChange={setIsStickerOpen}
          onPick={handleStickerPick}
          role={role}
        />
      )}
      {sheet?.kind === "actions" && sheetMessage && (
        <MessageActionsSheet
          isOpen={isSheetOpen}
          onOpenChange={setIsSheetOpen}
          message={sheetMessage}
          viewer={adapter.viewer}
          canWrite={chatEnabled}
          onReact={(emoji) => {
            setIsSheetOpen(false);
            if (sheetMessage.id !== null) {
              void chat.react(sheetMessage.id, emoji);
            }
          }}
          onReply={() => {
            setIsSheetOpen(false);
            setEditing(null);
            setReplyId(sheetMessage.id);
          }}
          onCopy={() => void handleCopy(sheetMessage)}
          onEdit={() => {
            setIsSheetOpen(false);
            setReplyId(null);
            setEditing(
              sheetMessage.id === null
                ? null
                : { id: sheetMessage.id, body: sheetMessage.body },
            );
          }}
          onUnsend={() => void handleUnsend(sheetMessage)}
          extra={
            canManage ? (
              <button
                type="button"
                onClick={() => void handleHide(sheetMessage, true)}
                className={SHEET_ROW}
              >
                <EyeOff className="size-5" aria-hidden />
                {hideLabel(sheetMessage)}
              </button>
            ) : undefined
          }
        />
      )}
      {sheet?.kind === "hidden" && sheetMessage && (
        <BottomSheet
          isOpen={isSheetOpen}
          onOpenChange={setIsSheetOpen}
          title={t("thread.hiddenByManager")}
        >
          <button
            type="button"
            onClick={() => void handleHide(sheetMessage, false)}
            className={SHEET_ROW}
          >
            <EyeOff className="size-5" aria-hidden />
            {hideLabel(sheetMessage)}
          </button>
        </BottomSheet>
      )}
      {sheet?.kind === "history" && sheetMessage && (
        <EditHistorySheet
          isOpen={isSheetOpen}
          onOpenChange={setIsSheetOpen}
          editsUrl={adapter.editsUrl(sheetMessage.id ?? 0)}
          currentBody={sheetMessage.body}
        />
      )}
      {sheet?.kind === "seen" && sheetMessage && (
        <SeenBySheet
          isOpen={isSheetOpen}
          onOpenChange={setIsSheetOpen}
          url={sheetMessage.id === null ? null : routes.seenBy(sheetMessage.id)}
        />
      )}
    </div>
  );
};

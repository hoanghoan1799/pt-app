"use client";

import clsx from "clsx";
import { Settings } from "lucide-react";
import dynamic from "next/dynamic";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";

import { useConfirm } from "@/components/common/ConfirmDialog/use-confirm";
import { ChatSettingsSheet } from "@/features/chat/components/ChatSettingsSheet";
import { Composer } from "@/features/chat/components/Composer";
import { EditHistorySheet } from "@/features/chat/components/EditHistorySheet";
import { LockedBanner } from "@/features/chat/components/LockedBanner";
import { MessageActionsSheet } from "@/features/chat/components/MessageActionsSheet";
import { MessageBubble } from "@/features/chat/components/MessageBubble";
import { NewMessagesChip } from "@/features/chat/components/NewMessagesChip";
import { PresenceStatus } from "@/features/chat/components/PresenceStatus";
import { PushOptInCard } from "@/features/chat/components/PushOptInCard";
import { ReactorsSheet } from "@/features/chat/components/ReactorsSheet";
import { ReplyBar } from "@/features/chat/components/ReplyBar";
import { TypingIndicator } from "@/features/chat/components/TypingIndicator";
import { CHAT_MESSAGES } from "@/features/chat/constants/messages";
import { useChatAdapter } from "@/features/chat/hooks/use-chat-adapter";
import type { ThreadSnapshot } from "@/features/chat/hooks/use-chat-messages";
import { useChatMessages } from "@/features/chat/hooks/use-chat-messages";
import { useChatTransport } from "@/features/chat/hooks/use-chat-transport";
import { usePeerPresence } from "@/features/chat/hooks/use-peer-presence";
import type { ChatColorKey } from "@/features/chat/utils/chat-palette";
import {
  adminLabel,
  bubbleColorFor,
  type ChatProfileView,
} from "@/features/chat/utils/chat-settings";
import {
  buildThreadItems,
  firstStoredId,
  isNearBottom,
  latestAdminName,
  markUnsentQuotes,
  myReactionOf,
  quoteText,
  senderLabel,
  type ThreadMessage,
  type ThreadViewer,
  USER_VIEWER,
} from "@/features/chat/utils/chat-thread-rules";
import { displayNameFor } from "@/features/chat/utils/display-name";
import type { PresenceView } from "@/features/chat/utils/presence-status";

export interface ChatThreadProps {
  initial: ThreadSnapshot;
  userId: number;
  conversationId: number | null;
  // The page header; rendered inside the shell so the keyboard resize keeps
  // it in place. A function receives the username of the newest PT who wrote
  // in the loaded messages (null if none or deleted) and the peer presence
  // (the trainee header shows it; the admin view keeps a separate row).
  header:
    | ReactNode
    | ((
        latestPeerName: string | null,
        presence: PresenceView | null,
        settings: {
          profile: ChatProfileView;
          openSettings: () => void;
        },
      ) => ReactNode);
  // The viewer's real name, for the settings sheet (the trainee's name; the
  // admin view uses `viewer.adminName`).
  selfName?: string;
  // Real name of the other side before any PT message names them (trainee).
  fallbackPeerName?: string;
  viewer?: ThreadViewer;
  // Admin only: the saved account colour, preselected in the settings sheet.
  accountColor?: ChatColorKey | null;
  emptyText?: string;
  ariaLabel?: string;
}

const TRAINEE_EMPTY_TEXT = "Gửi tin nhắn đầu tiên cho PT của bạn";
const TRAINEE_LOCKED_EMPTY_TEXT = "PT chưa mở nhắn tin cho bạn";
const TRAINEE_ARIA_LABEL = "Cuộc trò chuyện với PT";

const KEYBOARD_MIN_PX = 120;
const HEART = "❤️";
// Loaded on the first tap of the sticker button, so the picker (and its GIPHY
// code) is not in the main chat bundle.
const StickerPanel = dynamic(
  () =>
    import("@/features/chat/components/StickerPanel").then(
      (module) => module.StickerPanel,
    ),
  { ssr: false },
);

const HIGHLIGHT_MS = 1500;

type SheetKind = "actions" | "reactors" | "history";

// Follows the visual viewport so the composer stays above the on-screen
// keyboard (iOS does not resize the layout viewport).
const useVisualViewport = () => {
  const [viewport, setViewport] = useState<{
    height: number;
    offsetTop: number;
    keyboardOpen: boolean;
  } | null>(null);

  useEffect(() => {
    const vv = window.visualViewport;

    if (!vv) {
      return;
    }
    const update = () => {
      setViewport({
        height: vv.height,
        offsetTop: vv.offsetTop,
        keyboardOpen: window.innerHeight - vv.height > KEYBOARD_MIN_PX,
      });
    };

    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  return viewport;
};

export const ChatThread = ({
  initial,
  userId,
  conversationId,
  header,
  viewer = USER_VIEWER,
  accountColor = null,
  selfName = "Bạn",
  fallbackPeerName = "PT",
  emptyText,
  ariaLabel = TRAINEE_ARIA_LABEL,
}: ChatThreadProps) => {
  const isAdmin = viewer.role === "admin";
  const [isVisible, setIsVisible] = useState(true);
  const adapter = useChatAdapter(viewer, userId, conversationId);
  const chat = useChatMessages({ adapter, initial, isViewing: isVisible });
  const { messages, hasMore, chatEnabled, peerReadUpTo, sync } = chat;
  const presence = usePeerPresence({
    role: viewer.role,
    userId,
    fromThread: chat.peerLastSeenAt,
  });
  const viewport = useVisualViewport();
  const scroller = useRef<HTMLDivElement>(null);
  const wasNearBottom = useRef(true);
  // undefined = not measured yet (first paint is handled separately).
  const lastItemKey = useRef<string | null | undefined>(undefined);
  const olderAnchor = useRef<{ height: number; firstId: number | null } | null>(
    null,
  );
  const [showNewChip, setShowNewChip] = useState(false);
  const confirm = useConfirm();
  // The open sheet and the message it is about; kept after closing so the
  // content does not vanish during the exit animation.
  const [sheet, setSheet] = useState<{ kind: SheetKind; id: number } | null>(
    null,
  );
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [replyId, setReplyId] = useState<number | null>(null);
  const [editing, setEditing] = useState<{ id: number; body: string } | null>(
    null,
  );
  const [highlightId, setHighlightId] = useState<number | null>(null);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  // The panel mounts on the first tap and stays, so its sheet can animate out.
  const [isStickerOpen, setIsStickerOpen] = useState(false);
  const [hasStickerPanel, setHasStickerPanel] = useState(false);
  const { profile } = chat;

  const { isPeerTyping, clearPeerTyping, sendTyping } = useChatTransport({
    role: viewer.role,
    userId,
    conversationId,
    chatEnabled,
    onSync: sync,
  });

  useEffect(() => {
    const onChange = () => setIsVisible(document.visibilityState === "visible");

    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);

  // `Date.now()` only matters for "Hôm nay"/"Hôm qua"; refreshed per render.
  const items = useMemo(
    () =>
      buildThreadItems(
        markUnsentQuotes(messages),
        peerReadUpTo,
        // eslint-disable-next-line react-hooks/purity
        Date.now(),
        adapter.viewer,
        profile.nicknames,
      ),
    [messages, peerReadUpTo, adapter.viewer, profile.nicknames],
  );

  const scrollToBottom = useCallback((smooth: boolean) => {
    const node = scroller.current;

    if (node) {
      node.scrollTo({
        top: node.scrollHeight,
        behavior: smooth ? "smooth" : "auto",
      });
    }
  }, []);

  // First paint at the bottom.
  useLayoutEffect(() => {
    scrollToBottom(false);
  }, [scrollToBottom]);

  // New bubble at the end: follow when the reader is near the bottom or it is
  // their own; otherwise offer the chip.
  const last = messages[messages.length - 1];
  const lastKey = last
    ? last.id === null
      ? last.clientId
      : String(last.id)
    : null;

  // The indicator ends the moment the peer's message arrives.
  const lastPeerKey = last && last.senderRole !== viewer.role ? lastKey : null;

  useEffect(() => {
    if (lastPeerKey !== null) {
      clearPeerTyping();
    }
  }, [lastPeerKey, clearPeerTyping]);

  // The indicator row grows the log: keep the latest in view if the reader is
  // already at the bottom.
  useLayoutEffect(() => {
    if (isPeerTyping && wasNearBottom.current) {
      scrollToBottom(true);
    }
  }, [isPeerTyping, scrollToBottom]);

  useLayoutEffect(() => {
    if (lastKey === lastItemKey.current) {
      return;
    }
    const isFirstRun = lastItemKey.current === undefined;

    lastItemKey.current = lastKey;
    if (isFirstRun || !last) {
      return;
    }
    if (wasNearBottom.current || last.senderRole === viewer.role) {
      scrollToBottom(true);
    } else {
      setShowNewChip(true);
    }
  }, [lastKey, last, scrollToBottom, viewer.role]);

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

  // Keyboard open/close and viewport resize: stay on the latest message.
  const viewportHeight = viewport?.height;

  useLayoutEffect(() => {
    if (wasNearBottom.current) {
      scrollToBottom(false);
    }
  }, [viewportHeight, scrollToBottom]);

  const findMessage = useCallback(
    (id: number | null) =>
      id === null ? undefined : messages.find((message) => message.id === id),
    [messages],
  );
  const sheetMessage = findMessage(sheet?.id ?? null);
  const replyMessage = findMessage(replyId);
  // An edit whose message was unsent meanwhile ends by itself.
  const activeEditing =
    editing && findMessage(editing.id)?.deleted === false ? editing : null;
  const hasComposerBar =
    chatEnabled && (replyMessage !== undefined || activeEditing !== null);

  // The bar changes the composer height; stay on the latest message.
  useLayoutEffect(() => {
    if (wasNearBottom.current) {
      scrollToBottom(false);
    }
  }, [hasComposerBar, scrollToBottom]);

  useEffect(
    () => () => {
      if (highlightTimer.current !== null) {
        clearTimeout(highlightTimer.current);
      }
    },
    [],
  );

  const openSheet = (kind: SheetKind, message: ThreadMessage) => {
    if (message.id === null) {
      return;
    }
    setSheet({ kind, id: message.id });
    setIsSheetOpen(true);
  };

  const openActions = (message: ThreadMessage) => {
    // A locked chat leaves a sticker nothing to offer (no Copy, no reactions).
    if (!message.deleted && (chatEnabled || !message.sticker)) {
      openSheet("actions", message);
    }
  };

  // Double-tap: my heart on or off.
  const toggleHeart = (message: ThreadMessage) => {
    if (!chatEnabled || message.id === null || message.deleted) {
      return;
    }
    void chat.react(
      message.id,
      myReactionOf(message, adapter.viewer) === HEART ? null : HEART,
    );
  };

  const handleReact = (message: ThreadMessage, emoji: string | null) => {
    setIsSheetOpen(false);
    if (message.id !== null) {
      void chat.react(message.id, emoji);
    }
  };

  const handleCopy = async (message: ThreadMessage) => {
    setIsSheetOpen(false);
    try {
      await navigator.clipboard.writeText(message.body);
      toast.success("Đã sao chép");
    } catch {
      toast.error("Không sao chép được");
    }
  };

  const handleReply = (message: ThreadMessage) => {
    setIsSheetOpen(false);
    setEditing(null);
    setReplyId(message.id);
  };

  const handleEdit = (message: ThreadMessage) => {
    setIsSheetOpen(false);
    setReplyId(null);
    setEditing(
      message.id === null ? null : { id: message.id, body: message.body },
    );
  };

  const handleUnsend = async (message: ThreadMessage) => {
    const id = message.id;

    // Close ours first: only one sheet is on screen at a time.
    setIsSheetOpen(false);
    if (id === null) {
      return;
    }
    const isConfirmed = await confirm({
      title: "Thu hồi tin nhắn này với mọi người?",
      description: "Cả hai bên sẽ chỉ thấy “Tin nhắn đã bị thu hồi”.",
      confirmLabel: "Thu hồi",
      isDanger: true,
    });

    if (!isConfirmed) {
      return;
    }
    setEditing((current) => (current?.id === id ? null : current));
    setReplyId((current) => (current === id ? null : current));
    void chat.unsend(id);
  };

  const jumpToMessage = (id: number) => {
    const node = scroller.current?.querySelector(`[data-message-id="${id}"]`);

    if (!node) {
      return;
    }
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

  const handleSend = (body: string) => {
    chat.send(body, replyMessage);
    setReplyId(null);
  };

  const openStickers = () => {
    setHasStickerPanel(true);
    setIsStickerOpen(true);
  };

  const handleStickerPick = (
    sticker: Parameters<typeof chat.sendSticker>[0],
  ) => {
    chat.sendSticker(sticker, replyMessage);
    setReplyId(null);
  };

  const handleSaveEdit = (body: string) => {
    if (activeEditing) {
      void chat.edit(activeEditing.id, body);
    }
    setEditing(null);
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
    }
  };

  const handleLoadOlder = () => {
    const node = scroller.current;

    if (node) {
      olderAnchor.current = { height: node.scrollHeight, firstId };
    }
    void chat.loadOlder();
  };

  const emptyMessage =
    emptyText ?? (chatEnabled ? TRAINEE_EMPTY_TEXT : TRAINEE_LOCKED_EMPTY_TEXT);
  const latestPeerName = latestAdminName(messages);
  const openSettings = () => setIsSettingsOpen(true);
  const headerNode =
    typeof header === "function"
      ? header(latestPeerName, presence, { profile, openSettings })
      : header;
  const peerRealName =
    viewer.role === "admin"
      ? (viewer.peerName ?? "Học viên")
      : (latestPeerName ?? fallbackPeerName);
  const typingName =
    viewer.role === "admin"
      ? displayNameFor(profile.nicknames, "user", peerRealName)
      : adminLabel(profile.nicknames, null, peerRealName, "pt");

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
      {isAdmin ? (
        // The admin header is tall; give the space back while typing.
        <div className={viewport?.keyboardOpen ? "hidden" : undefined}>
          {headerNode}
        </div>
      ) : (
        headerNode
      )}
      {isAdmin && (
        // Under the header so it stays visible when the admin header folds
        // away for the keyboard.
        <div className="shrink-0 border-b border-line bg-bg px-4 py-1.5">
          <div className="mx-auto flex w-full max-w-lg items-center gap-3">
            <div className="min-w-0 flex-1">
              {presence?.text && <PresenceStatus presence={presence} />}
              {profile.nicknames.user && (
                <p
                  data-shown-name
                  className="truncate text-xs font-medium text-fg"
                >
                  Hiển thị: {profile.nicknames.user}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={openSettings}
              className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-xs font-semibold text-fg transition active:bg-line"
            >
              <Settings className="size-4" aria-hidden />
              Biệt danh và màu
            </button>
          </div>
        </div>
      )}
      <div className="relative min-h-0 flex-1">
        <div
          ref={scroller}
          onScroll={handleScroll}
          className="h-full overflow-y-auto overscroll-contain px-4 pb-3"
        >
          <div className="mx-auto w-full max-w-lg">
            {chatEnabled && !isAdmin && (
              <div className="pt-4">
                <PushOptInCard role="user" />
              </div>
            )}
            {hasMore && (
              <div className="flex justify-center pt-4">
                <button
                  type="button"
                  onClick={handleLoadOlder}
                  disabled={chat.isLoadingOlder}
                  className="rounded-full border border-line bg-surface px-4 py-2 text-sm font-medium text-muted transition active:bg-line disabled:opacity-50"
                >
                  {chat.isLoadingOlder ? "Đang tải…" : "Xem tin cũ hơn"}
                </button>
              </div>
            )}
            {items.length === 0 && (
              <p className="px-6 py-16 text-center text-sm text-muted">
                {emptyMessage}
              </p>
            )}
            <div role="log" aria-live="polite" aria-label={ariaLabel}>
              {items.map((item) => {
                if (item.kind === "message") {
                  return (
                    <MessageBubble
                      key={item.key}
                      item={item}
                      viewer={adapter.viewer}
                      onRetry={chat.retry}
                      nicknames={profile.nicknames}
                      isHighlighted={
                        item.message.id !== null &&
                        item.message.id === highlightId
                      }
                      onOpenActions={openActions}
                      onToggleHeart={toggleHeart}
                      onOpenReactors={(message) =>
                        openSheet("reactors", message)
                      }
                      onOpenHistory={(message) => openSheet("history", message)}
                      onJumpToReply={jumpToMessage}
                      color={bubbleColorFor(
                        item.message,
                        item.mine,
                        profile.colors,
                      )}
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
            {isPeerTyping && chatEnabled && (
              <TypingIndicator name={typingName} />
            )}
          </div>
        </div>
        {showNewChip && (
          <NewMessagesChip onClick={() => scrollToBottom(true)} />
        )}
      </div>
      <div
        className={clsx(
          "mx-auto w-full max-w-lg shrink-0 pt-2",
          // Neither view has a tab bar under the thread.
          viewport?.keyboardOpen
            ? "pb-2"
            : "pb-[calc(env(safe-area-inset-bottom)+0.5rem)]",
        )}
      >
        {chat.sendError && (
          <p role="alert" className="mx-4 mb-2 text-sm text-danger">
            {chat.sendError}
          </p>
        )}
        {chatEnabled && activeEditing && (
          <ReplyBar
            title="Đang chỉnh sửa"
            snippet={activeEditing.body}
            closeLabel="Huỷ chỉnh sửa"
            onClose={() => setEditing(null)}
          />
        )}
        {chatEnabled && !activeEditing && replyMessage && (
          <ReplyBar
            title={`Đang trả lời ${senderLabel(replyMessage, adapter.viewer, profile.nicknames)}`}
            snippet={quoteText({
              deleted: replyMessage.deleted,
              isSticker: Boolean(replyMessage.sticker),
              body: replyMessage.body,
            })}
            closeLabel="Huỷ trả lời"
            onClose={() => setReplyId(null)}
          />
        )}
        {chatEnabled ? (
          <Composer
            onSend={handleSend}
            editing={activeEditing}
            onSaveEdit={handleSaveEdit}
            replyId={replyMessage?.id ?? null}
            onOpenStickers={openStickers}
            onTyping={sendTyping}
            placeholder={
              viewer.role === "admin" && viewer.peerName
                ? `Nhắn tin cho ${viewer.peerName}…`
                : undefined
            }
          />
        ) : (
          <LockedBanner
            text={
              isAdmin
                ? CHAT_MESSAGES.ADMIN_CHAT_LOCKED
                : CHAT_MESSAGES.CHAT_LOCKED
            }
          />
        )}
      </div>
      {hasStickerPanel && chatEnabled && (
        <StickerPanel
          isOpen={isStickerOpen}
          onOpenChange={setIsStickerOpen}
          onPick={handleStickerPick}
        />
      )}
      {sheet?.kind === "actions" && sheetMessage && (
        <MessageActionsSheet
          isOpen={isSheetOpen}
          onOpenChange={setIsSheetOpen}
          message={sheetMessage}
          viewer={adapter.viewer}
          canWrite={chatEnabled}
          onReact={(emoji) => handleReact(sheetMessage, emoji)}
          onReply={() => handleReply(sheetMessage)}
          onCopy={() => void handleCopy(sheetMessage)}
          onEdit={() => handleEdit(sheetMessage)}
          onUnsend={() => void handleUnsend(sheetMessage)}
        />
      )}
      {sheet?.kind === "reactors" && sheetMessage && (
        <ReactorsSheet
          isOpen={isSheetOpen}
          onOpenChange={setIsSheetOpen}
          reactions={sheetMessage.reactions}
          viewer={adapter.viewer}
          nicknames={profile.nicknames}
        />
      )}
      {sheet?.kind === "history" && sheetMessage && (
        <EditHistorySheet
          isOpen={isSheetOpen}
          onOpenChange={setIsSheetOpen}
          editsUrl={adapter.editsUrl(sheetMessage.id ?? 0)}
          currentBody={sheetMessage.body}
        />
      )}
      <ChatSettingsSheet
        isOpen={isSettingsOpen}
        onOpenChange={setIsSettingsOpen}
        viewer={adapter.viewer}
        conversationId={conversationId}
        peerName={peerRealName}
        selfName={viewer.role === "admin" ? viewer.adminName : selfName}
        profile={profile}
        onProfileChange={chat.setProfile}
        accountColor={accountColor}
        onSync={sync}
        chatEnabled={chatEnabled}
      />
    </div>
  );
};

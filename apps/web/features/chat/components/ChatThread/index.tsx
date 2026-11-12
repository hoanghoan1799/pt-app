"use client";

import clsx from "clsx";
import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
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
import { ScrollJumpButton } from "@/components/common/ScrollJumpButton";
import { Spinner } from "@/components/common/Spinner";
import { Composer } from "@/features/chat/components/Composer";
import { LockedBanner } from "@/features/chat/components/LockedBanner";
import { MessageBubble } from "@/features/chat/components/MessageBubble";
import { PushOptInCard } from "@/features/chat/components/PushOptInCard";
import { ReplyBar } from "@/features/chat/components/ReplyBar";
import { ReplyPostBar } from "@/features/chat/components/ReplyPostBar";
import { TypingIndicator } from "@/features/chat/components/TypingIndicator";
import { useChatAdapter } from "@/features/chat/hooks/use-chat-adapter";
import type { ThreadSnapshot } from "@/features/chat/hooks/use-chat-messages";
import { useChatMessages } from "@/features/chat/hooks/use-chat-messages";
import { useChatTransport } from "@/features/chat/hooks/use-chat-transport";
import { useClearNotifications } from "@/features/chat/hooks/use-clear-notifications";
import { useNeutralChatColors } from "@/features/chat/hooks/use-neutral-chat-colors";
import { usePeerPresence } from "@/features/chat/hooks/use-peer-presence";
import {
  adminLabel,
  bubbleColorFor,
  type ChatProfileView,
} from "@/features/chat/utils/chat-settings";
import {
  buildThreadItems,
  firstStoredId,
  isNearBottom,
  latestAdminId,
  latestAdminName,
  markUnsentQuotes,
  myReactionOf,
  quoteText,
  senderLabel,
  type ThreadMessage,
  type ThreadViewer,
  USER_VIEWER,
} from "@/features/chat/utils/chat-thread-rules";
import { chatNotificationTags } from "@/features/chat/utils/clear-notifications";
import { displayNameFor } from "@/features/chat/utils/display-name";
import type { PreparedPhoto } from "@/features/chat/utils/encode-photo";
import type { PresenceView } from "@/features/chat/utils/presence-status";
import { useIsEmbedded } from "@/features/chat-bubbles/hooks/use-is-embedded";
import type { DmReplyPostView } from "@/features/social/types/dm";
import { useScrollAway } from "@/hooks/use-scroll-away";
import { scrollBehaviorFor } from "@/utils/scroll-rules";

export interface ChatThreadProps {
  initial: ThreadSnapshot;
  userId: number;
  conversationId: number | null;
  // The chat info page the header opens.
  infoHref: string;
  // Open scrolled to this message and highlight it (gallery, search).
  jumpToId?: number | null;
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
          // The chat info page (KAN-160).
          infoHref: string;
          // The other side's photo for the header (versioned URL) or null.
          peerAvatar: string | null;
          // The newest PT who wrote is verified (blue tick).
          peerVerified: boolean;
        },
      ) => ReactNode);
  // Real name of the other side before any PT message names them (trainee).
  fallbackPeerName?: string;
  // Ids of verified admins, for the blue tick next to their names.
  verifiedAdminIds?: number[];
  viewer?: ThreadViewer;
  emptyText?: string;
  ariaLabel?: string;
  // Photos of the people in this thread (versioned /api/avatar URLs), keyed
  // like nicknames: "user" or "admin:<id>". Only people with a photo.
  avatars?: Readonly<Record<string, string>>;
  // A post to reply to, opened from a post card (`?replyPost=`); sent with the
  // next text message. Attaching it replaces a message reply and vice versa.
  replyPost?: (DmReplyPostView & { available: true }) | null;
  // Shown inside the bubble panel (`?embed=1`): no header, the panel has one.
  isEmbed?: boolean;
}

const NO_VERIFIED: number[] = [];
const NO_AVATARS: Readonly<Record<string, string>> = {};

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

// The message sheets mount only after a long-press or tap on a message, so
// their code loads on demand. Nothing is shown while the chunk loads: the sheet
// is an overlay, and it opens as soon as the module arrives.
const MessageActionsSheet = dynamic(
  () =>
    import("@/features/chat/components/MessageActionsSheet").then(
      (module) => module.MessageActionsSheet,
    ),
  { ssr: false },
);
const ReactorsSheet = dynamic(
  () =>
    import("@/features/chat/components/ReactorsSheet").then(
      (module) => module.ReactorsSheet,
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

const HIGHLIGHT_MS = 1500;
// A jumped-to message stays marked a little longer.
const JUMP_HIGHLIGHT_MS = 2000;
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

    // iOS can skip the last visualViewport event when the keyboard closes and
    // leaves the page scrolled up, so the thread stayed lifted. Re-read the
    // viewport a few times after the composer loses focus and scroll the page
    // back to the top.
    const timers: number[] = [];
    const settleAfterKeyboard = () => {
      for (const delay of [0, 120, 300, 600]) {
        timers.push(
          window.setTimeout(() => {
            if (window.scrollY !== 0) {
              window.scrollTo(0, 0);
            }
            update();
          }, delay),
        );
      }
    };

    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    document.addEventListener("focusout", settleAfterKeyboard);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      document.removeEventListener("focusout", settleAfterKeyboard);
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

  return viewport;
};

export const ChatThread = ({
  initial,
  userId,
  conversationId,
  header,
  infoHref,
  jumpToId = null,
  viewer = USER_VIEWER,
  fallbackPeerName = "PT",
  verifiedAdminIds = NO_VERIFIED,
  emptyText,
  ariaLabel,
  avatars = NO_AVATARS,
  replyPost = null,
  isEmbed = false,
}: ChatThreadProps) => {
  const router = useRouter();
  const isFramed = useIsEmbedded();
  const pathname = usePathname();
  const locale = useLocale();
  const t = useTranslations("chat.chatThread");
  const isAdmin = viewer.role === "admin";
  // Admin-only and per device; trainee views never read the stored value.
  const [neutralColors] = useNeutralChatColors(isAdmin);
  const [isVisible, setIsVisible] = useState(true);
  const adapter = useChatAdapter(viewer, userId, conversationId);
  const chat = useChatMessages({ adapter, initial, isViewing: isVisible });
  const { messages, hasMore, chatEnabled, peerReadUpTo, sync } = chat;
  // A trainee whose chat is on always has a conversation (the API creates it
  // when the PT switches chat on, or on the first thread read), so the realtime
  // rooms and admin routes always have an id to use. Only a locked chat with
  // nothing ever sent has none.

  useClearNotifications(
    conversationId === null ? null : chatNotificationTags(conversationId),
    messages.at(-1)?.id,
  );
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
  const [newCount, setNewCount] = useState(0);
  const { isAway } = useScrollAway({ edge: "bottom", container: scroller });
  const tJump = useTranslations("common.scrollJump");
  const confirm = useConfirm();
  // The open sheet and the message it is about; kept after closing so the
  // content does not vanish during the exit animation.
  const [sheet, setSheet] = useState<{ kind: SheetKind; id: number } | null>(
    null,
  );
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [replyId, setReplyId] = useState<number | null>(null);
  const [quote, setQuote] = useState(replyPost);
  const [editing, setEditing] = useState<{ id: number; body: string } | null>(
    null,
  );
  const [highlightId, setHighlightId] = useState<number | null>(null);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
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
        locale,
      ),
    [messages, peerReadUpTo, adapter.viewer, profile.nicknames, locale],
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
      setNewCount((n) => n + 1);
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

  // When the keyboard closes the list grows back, but iOS keeps the old
  // scrollTop (past the new end) and paints an empty gap under the last
  // message until the user scrolls. Re-anchor on every size change of the list.
  useEffect(() => {
    const node = scroller.current;

    if (!node || typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver(() => {
      const maxTop = Math.max(0, node.scrollHeight - node.clientHeight);

      if (wasNearBottom.current || node.scrollTop > maxTop) {
        node.scrollTop = maxTop;
      }
    });

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

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
  const activeQuote = chatEnabled && !activeEditing ? quote : null;
  const hasComposerBar =
    chatEnabled &&
    (replyMessage !== undefined || activeEditing !== null || quote !== null);

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
      toast.success(t("copied"));
    } catch {
      toast.error(t("copyFailed"));
    }
  };

  // Drops "?replyPost=" too, so a refresh does not attach the post again.
  const clearQuote = () => {
    setQuote(null);
    if (replyPost) {
      router.replace(pathname, { scroll: false });
    }
  };

  const handleReply = (message: ThreadMessage) => {
    setIsSheetOpen(false);
    setEditing(null);
    if (quote) {
      clearQuote();
    }
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
      title: t("unsendTitle"),
      description: t("unsendDescription"),
      confirmLabel: t("unsend"),
      isDanger: true,
    });

    if (!isConfirmed) {
      return;
    }
    setEditing((current) => (current?.id === id ? null : current));
    setReplyId((current) => (current === id ? null : current));
    void chat.unsend(id);
  };

  const jumpToMessage = (
    id: number,
    { smooth = true, durationMs = HIGHLIGHT_MS } = {},
  ) => {
    const node = scroller.current?.querySelector(`[data-message-id="${id}"]`);

    if (!node) {
      return;
    }
    // Leave "stay at the bottom" mode, or a later resize snaps back down.
    wasNearBottom.current = false;
    node.scrollIntoView({
      block: "center",
      behavior: smooth ? "smooth" : "auto",
    });
    setHighlightId(id);
    if (highlightTimer.current !== null) {
      clearTimeout(highlightTimer.current);
    }
    highlightTimer.current = setTimeout(() => {
      highlightTimer.current = null;
      setHighlightId(null);
    }, durationMs);
  };

  // Opened from the gallery or a search result: the page loaded the thread
  // around the message, so it is in the DOM after the first paint. It may run
  // twice (strict mode remounts effects); jumping again is harmless and, as
  // it runs after the first-paint scroll, it also wins over it.
  useEffect(() => {
    if (jumpToId !== null) {
      jumpToMessage(jumpToId, {
        smooth: false,
        durationMs: JUMP_HIGHLIGHT_MS,
      });
    }
    // Only the target matters; jumpToMessage reads refs and state setters.
  }, [jumpToId]);

  const handleSend = (body: string, photo?: PreparedPhoto) => {
    // A post reply needs a text; a photo sent without one leaves it in place.
    const post = activeQuote && body.trim() !== "" ? activeQuote : null;

    if (photo) {
      chat.sendPhoto(photo, body, replyMessage, post);
    } else {
      chat.send(body, replyMessage, post);
    }
    setReplyId(null);
    if (post) {
      clearQuote();
    }
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

  const emptyMessage =
    emptyText ?? (chatEnabled ? t("empty") : t("emptyLocked"));
  const latestPeerName = latestAdminName(messages);
  // The other side's photo in the header: the trainee for an admin, the PT who
  // wrote last for a trainee.
  const peerAvatar =
    viewer.role === "admin"
      ? (avatars.user ?? null)
      : (avatars[`admin:${latestAdminId(messages)}`] ?? null);
  const verifiedIds = new Set(verifiedAdminIds);
  const headerNode =
    isEmbed || isFramed
      ? null
      : typeof header === "function"
        ? header(latestPeerName, presence, {
            profile,
            infoHref,
            peerAvatar,
            peerVerified: verifiedIds.has(latestAdminId(messages) ?? -1),
          })
        : header;
  const peerRealName =
    viewer.role === "admin"
      ? (viewer.peerName ?? t("traineeFallback"))
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
                  className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-4 py-2 text-sm font-medium text-muted transition active:bg-line disabled:opacity-50"
                >
                  {chat.isLoadingOlder && <Spinner size="sm" />}
                  {chat.isLoadingOlder ? t("loadingOlder") : t("loadOlder")}
                </button>
              </div>
            )}
            {items.length === 0 && (
              <p className="px-6 py-16 text-center text-sm text-muted">
                {emptyMessage}
              </p>
            )}
            <div
              role="log"
              aria-live="polite"
              aria-label={ariaLabel ?? t("ariaLabel")}
            >
              {items.map((item) => {
                if (item.kind === "message") {
                  return (
                    <MessageBubble
                      key={item.key}
                      item={item}
                      viewer={adapter.viewer}
                      onRetry={chat.retry}
                      nicknames={profile.nicknames}
                      senderVerified={
                        item.message.senderRole === "admin" &&
                        verifiedIds.has(item.message.senderAdminId ?? -1)
                      }
                      avatarSrc={
                        item.mine
                          ? null
                          : (avatars[
                              item.message.senderRole === "user"
                                ? "user"
                                : `admin:${item.message.senderAdminId}`
                            ] ?? null)
                      }
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
                      isNeutral={isAdmin && neutralColors}
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
            title={t("editing")}
            snippet={activeEditing.body}
            closeLabel={t("cancelEdit")}
            onClose={() => setEditing(null)}
          />
        )}
        {activeQuote && (
          <ReplyPostBar post={activeQuote} onClose={clearQuote} />
        )}
        {chatEnabled && !activeEditing && replyMessage && (
          <ReplyBar
            title={t("replying", {
              name: senderLabel(
                replyMessage,
                adapter.viewer,
                profile.nicknames,
                locale,
              ),
            })}
            snippet={quoteText(
              {
                deleted: replyMessage.deleted,
                isSticker: Boolean(replyMessage.sticker),
                isPhoto: Boolean(replyMessage.photo),
                body: replyMessage.body,
              },
              locale,
            )}
            closeLabel={t("cancelReply")}
            onClose={() => setReplyId(null)}
          />
        )}
        {chatEnabled ? (
          <Composer
            onSend={handleSend}
            canAttachPhoto
            editing={activeEditing}
            onSaveEdit={handleSaveEdit}
            replyId={replyMessage?.id ?? null}
            onOpenStickers={openStickers}
            onSendSticker={handleStickerPick}
            onTyping={sendTyping}
            placeholder={
              viewer.role === "admin" && viewer.peerName
                ? t("placeholder", { name: viewer.peerName })
                : undefined
            }
          />
        ) : (
          <LockedBanner text={isAdmin ? t("adminLocked") : t("locked")} />
        )}
      </div>
      {hasStickerPanel && chatEnabled && (
        <StickerPanel
          isOpen={isStickerOpen}
          onOpenChange={setIsStickerOpen}
          onPick={handleStickerPick}
          role={viewer.role}
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
    </div>
  );
};

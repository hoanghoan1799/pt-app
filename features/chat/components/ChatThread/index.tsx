"use client";

import clsx from "clsx";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { Composer } from "@/features/chat/components/Composer";
import { LockedBanner } from "@/features/chat/components/LockedBanner";
import { MessageBubble } from "@/features/chat/components/MessageBubble";
import { NewMessagesChip } from "@/features/chat/components/NewMessagesChip";
import { PushOptInCard } from "@/features/chat/components/PushOptInCard";
import { CHAT_MESSAGES } from "@/features/chat/constants/messages";
import { useChatAdapter } from "@/features/chat/hooks/use-chat-adapter";
import type { ThreadSnapshot } from "@/features/chat/hooks/use-chat-messages";
import { useChatMessages } from "@/features/chat/hooks/use-chat-messages";
import { useChatTransport } from "@/features/chat/hooks/use-chat-transport";
import {
  buildThreadItems,
  firstStoredId,
  isNearBottom,
  latestAdminName,
  type ThreadViewer,
  USER_VIEWER,
} from "@/features/chat/utils/chat-thread-rules";

export interface ChatThreadProps {
  initial: ThreadSnapshot;
  userId: number;
  conversationId: number | null;
  // The page header; rendered inside the shell so the keyboard resize keeps
  // it in place. A function receives the username of the newest PT who wrote
  // in the loaded messages (null if none or deleted).
  header: ReactNode | ((latestPeerName: string | null) => ReactNode);
  viewer?: ThreadViewer;
  emptyText?: string;
  ariaLabel?: string;
}

const TRAINEE_EMPTY_TEXT = "Gửi tin nhắn đầu tiên cho PT của bạn";
const TRAINEE_ARIA_LABEL = "Cuộc trò chuyện với PT";

const KEYBOARD_MIN_PX = 120;

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
  emptyText = TRAINEE_EMPTY_TEXT,
  ariaLabel = TRAINEE_ARIA_LABEL,
}: ChatThreadProps) => {
  const isAdmin = viewer.role === "admin";
  const [isVisible, setIsVisible] = useState(true);
  const adapter = useChatAdapter(viewer, userId, conversationId);
  const chat = useChatMessages({ adapter, initial, isViewing: isVisible });
  const { messages, hasMore, chatEnabled, peerReadUpTo, sync } = chat;
  const viewport = useVisualViewport();
  const scroller = useRef<HTMLDivElement>(null);
  const wasNearBottom = useRef(true);
  // undefined = not measured yet (first paint is handled separately).
  const lastItemKey = useRef<string | null | undefined>(undefined);
  const olderAnchor = useRef<{ height: number; firstId: number | null } | null>(
    null,
  );
  const [showNewChip, setShowNewChip] = useState(false);

  useChatTransport({
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
    // eslint-disable-next-line react-hooks/purity
    () => buildThreadItems(messages, peerReadUpTo, Date.now(), adapter.viewer),
    [messages, peerReadUpTo, adapter.viewer],
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

  const headerNode =
    typeof header === "function" ? header(latestAdminName(messages)) : header;

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
                  className="rounded-full border border-line bg-surface px-4 py-2 text-sm font-medium text-muted transition active:bg-line disabled:opacity-50"
                >
                  {chat.isLoadingOlder ? "Đang tải…" : "Xem tin cũ hơn"}
                </button>
              </div>
            )}
            {items.length === 0 && (
              <p className="px-6 py-16 text-center text-sm text-muted">
                {emptyText}
              </p>
            )}
            <div role="log" aria-live="polite" aria-label={ariaLabel}>
              {items.map((item) => {
                if (item.kind === "message") {
                  return (
                    <MessageBubble
                      key={item.key}
                      item={item}
                      onRetry={chat.retry}
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
        {showNewChip && (
          <NewMessagesChip onClick={() => scrollToBottom(true)} />
        )}
      </div>
      <div
        className={clsx(
          "mx-auto w-full max-w-lg shrink-0 pt-2",
          // The trainee view clears the floating tab bar (unless the keyboard
          // covers it); the admin view has none.
          viewport?.keyboardOpen
            ? "pb-2"
            : isAdmin
              ? "pb-[calc(env(safe-area-inset-bottom)+0.5rem)]"
              : "pb-[calc(env(safe-area-inset-bottom)+5.25rem)]",
        )}
      >
        {chat.sendError && (
          <p role="alert" className="mx-4 mb-2 text-sm text-danger">
            {chat.sendError}
          </p>
        )}
        {chatEnabled ? (
          <Composer
            onSend={chat.send}
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
    </div>
  );
};

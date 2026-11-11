"use client";

import { X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { useInboxRealtimeConnected } from "@/features/chat/hooks/inbox-realtime";
import { useUnreadPayload } from "@/features/chat/hooks/unread-store";
import {
  ADMIN_UNREAD_URL,
  USER_UNREAD_URL,
} from "@/features/chat/hooks/use-chat-unread";
import { unreadPollMs } from "@/features/chat/utils/polling-rules";
import { isOnline, parseLastSeen } from "@/features/chat/utils/presence";
import {
  parseAdminUnread,
  parseUserUnread,
} from "@/features/chat/utils/unread-payload";
import { BubbleItem } from "@/features/chat-bubbles/components/BubbleItem";
import {
  BubblePanel,
  type PanelBox,
} from "@/features/chat-bubbles/components/BubblePanel";
import {
  BUBBLE_SIZE,
  NAVIGATE_MESSAGE,
  PANEL_GAP,
  PANEL_TOP,
  TOP_MIN,
} from "@/features/chat-bubbles/constants";
import { useBubbleDrag } from "@/features/chat-bubbles/hooks/use-bubble-drag";
import { useBubbleMeta } from "@/features/chat-bubbles/hooks/use-bubble-meta";
import { useBubblePopSetting } from "@/features/chat-bubbles/hooks/use-bubble-pop-setting";
import { useBubbleStore } from "@/features/chat-bubbles/hooks/use-bubble-store";
import { useElementSize } from "@/features/chat-bubbles/hooks/use-element-size";
import { useVisualViewport } from "@/features/chat-bubbles/hooks/use-visual-viewport";
import type { BubbleMeta, BubbleRole } from "@/features/chat-bubbles/types";
import {
  anchorFromDrop,
  rowPositions,
  stackPositions,
} from "@/features/chat-bubbles/utils/bubble-geometry";
import {
  chatPathForKey,
  safeNavigateHref,
} from "@/features/chat-bubbles/utils/bubble-links";
import {
  detectIncoming,
  type IncomingEntry,
  type SeenIds,
} from "@/features/chat-bubbles/utils/incoming-rules";
import { startVisibleInterval } from "@/utils/visible-interval";

const MIN_PANEL_HEIGHT = 240;
const PANEL_MAX_WIDTH = 512;
const SIDE_GAP = 16;
const PANEL_UNMOUNT_MS = 400;
const EXIT_MS = 300;
const ONLINE_TICK_MS = 30_000;
const ZONE_BOTTOM = 36;
const ZONE_SIZE = 64;

interface Placed {
  meta: BubbleMeta;
  x: number;
  y: number;
  z: number;
  badge: number;
}

// All bubbles of one role: the stack / row, drag and close target, the panel,
// the shared unread poll that pops a bubble on a new message.
export const BubbleHostInner = ({ role }: { role: BubbleRole }) => {
  const t = useTranslations("chat.bubbles");
  const router = useRouter();
  const pathname = usePathname();
  const [state, dispatch] = useBubbleStore(role);
  const metas = useBubbleMeta(role, state.keys, dispatch, state.expanded);
  // Null until mounted (server and first client render agree); then re-checked
  // so a dot turns off when the heartbeat stops.
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const tick = () => setNow(new Date());

    tick();
    return startVisibleInterval(tick, ONLINE_TICK_MS);
  }, []);
  const isMetaOnline = (meta: BubbleMeta) =>
    now !== null && isOnline(parseLastSeen(meta.lastSeenAt), now);
  const [layerRef, size] = useElementSize<HTMLDivElement>();
  const visualViewport = useVisualViewport();
  const [popEnabled] = useBubblePopSetting();
  const realtimeConnected = useInboxRealtimeConnected();
  const payload = useUnreadPayload(
    role === "admin" ? ADMIN_UNREAD_URL : USER_UNREAD_URL,
    true,
    unreadPollMs(role === "admin" && realtimeConnected),
  );
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [ghosts, setGhosts] = useState<Placed[]>([]);

  // ---- What is shown ----
  // The chat open full screen has no bubble while it is on screen.
  const visibleKeys = state.keys.filter(
    (key) => metas[key] && chatPathForKey(role, key) !== pathname,
  );
  const topKey = visibleKeys[visibleKeys.length - 1] ?? null;
  const expanded = state.expanded && topKey !== null;
  const activeKey = !expanded
    ? null
    : state.activeKey && visibleKeys.includes(state.activeKey)
      ? state.activeKey
      : topKey;

  const unread = useMemo(() => {
    if (payload === null) {
      return {} as Record<string, number>;
    }
    if (role === "user") {
      return { coach: parseUserUnread(payload).coachCount };
    }
    return Object.fromEntries(
      parseAdminUnread(payload).perTrainee.map((row) => [
        `user:${row.userId}`,
        row.unread,
      ]),
    );
  }, [payload, role]);

  // ---- Incoming messages ----
  const live = useRef({
    onScreen: [] as string[],
    muted: [] as string[],
    popEnabled,
  });
  const seen = useRef<SeenIds | null>(null);

  useEffect(() => {
    const onScreen = [
      ...state.keys.filter((key) => chatPathForKey(role, key) === pathname),
      ...(activeKey ? [activeKey] : []),
    ];

    live.current = { onScreen, muted: state.muted, popEnabled };
  });

  useEffect(() => {
    if (payload === null) {
      return;
    }
    const entries: IncomingEntry[] =
      role === "user"
        ? [
            {
              key: "coach",
              latestLoudIncomingId:
                parseUserUnread(payload).latestLoudIncomingId,
            },
          ]
        : parseAdminUnread(payload).perTrainee.map((row) => ({
            key: `user:${row.userId}`,
            latestLoudIncomingId: row.latestLoudIncomingId,
          }));
    // The chat on screen is also "on screen" for a path not stored as a bubble.
    const onScreen = [...live.current.onScreen];

    for (const entry of entries) {
      if (chatPathForKey(role, entry.key) === window.location.pathname) {
        onScreen.push(entry.key);
      }
    }
    const { popKeys, nextSeen } = detectIncoming({
      seen: seen.current,
      entries,
      onScreenKeys: onScreen,
      mutedKeys: live.current.muted,
      enabled: live.current.popEnabled,
    });

    seen.current = nextSeen;
    popKeys.forEach((key) => dispatch({ type: "open", key }));
  }, [payload, role, dispatch]);

  // ---- Panel life: kept mounted just long enough to animate out ----
  const [shownKey, setShownKey] = useState<string | null>(null);

  if (activeKey && shownKey !== activeKey) {
    setShownKey(activeKey);
  }
  useEffect(() => {
    if (activeKey || shownKey === null) {
      return;
    }
    const timer = setTimeout(() => setShownKey(null), PANEL_UNMOUNT_MS);

    return () => clearTimeout(timer);
  }, [activeKey, shownKey]);

  useEffect(() => {
    if (ghosts.length === 0) {
      return;
    }
    const timer = setTimeout(() => setGhosts([]), EXIT_MS);

    return () => clearTimeout(timer);
  }, [ghosts]);

  // Navigating away (back button, a link in the panel) folds the panel.
  useEffect(() => {
    dispatch({ type: "collapse" });
  }, [pathname, dispatch]);

  useEffect(() => {
    if (!expanded) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        dispatch({ type: "collapse" });
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded, dispatch]);

  // A link inside the panel that leaves the chat: follow it here, fold the panel.
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: unknown; href?: unknown } | null;

      if (
        event.origin !== window.location.origin ||
        event.source !== iframeRef.current?.contentWindow ||
        data?.type !== NAVIGATE_MESSAGE
      ) {
        return;
      }
      const href = safeNavigateHref(data.href);

      if (href) {
        dispatch({ type: "collapse" });
        router.push(href);
      }
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [dispatch, router]);

  // ---- Geometry ----
  const positions = expanded
    ? rowPositions(visibleKeys.length, size)
    : stackPositions(visibleKeys.length, state.anchor, size);
  const zoneCenter = {
    x: size.width / 2,
    y: size.height - ZONE_BOTTOM - ZONE_SIZE / 2,
  };
  const positionOf = (key: string) =>
    positions[Math.max(0, visibleKeys.indexOf(key))] ?? { x: 0, y: 0 };
  const totalUnread = visibleKeys.reduce(
    (sum, key) => sum + (unread[key] ?? 0),
    0,
  );

  const exitBubble = (placed: Placed[]) =>
    setGhosts((current) => [...current, ...placed]);

  const { drag, handlersFor } = useBubbleDrag({
    positionOf,
    zoneCenter,
    onTap: (key) => {
      if (!expanded) {
        if (topKey) {
          dispatch({ type: "expand", key: topKey });
        }
        return;
      }
      dispatch(
        key === activeKey ? { type: "collapse" } : { type: "expand", key },
      );
    },
    onDrop: (key, topLeft) => {
      if (expanded || !topKey) {
        return;
      }
      // The whole stack moves together; anchor on its top bubble.
      const grabbed = positionOf(key);
      const top = positionOf(topKey);

      dispatch({
        type: "setAnchor",
        anchor: anchorFromDrop(
          {
            x: top.x + topLeft.x - grabbed.x,
            y: top.y + topLeft.y - grabbed.y,
          },
          size,
        ),
      });
    },
    onCloseDrop: (key) => {
      if (expanded) {
        const meta = metas[key];

        exitBubble(placedFor([key]));
        dispatch({ type: "close", key });
        if (meta) {
          toast(t("closed", { name: meta.name }));
        }
        return;
      }
      exitBubble(placedFor(visibleKeys));
      visibleKeys.forEach((item) => dispatch({ type: "close", key: item }));
      toast(t("closedAll"));
    },
  });

  const isMoving = drag?.moved === true;
  const placedFor = (keys: string[]): Placed[] =>
    keys.flatMap((key, order) => {
      const meta = metas[key];

      if (!meta) {
        return [];
      }
      const base = positionOf(key);
      const moves = isMoving && (!expanded || drag?.key === key);
      const snapped = moves && drag?.hot;
      const depth = visibleKeys.length - 1 - visibleKeys.indexOf(key);

      return [
        {
          meta,
          x: snapped
            ? zoneCenter.x - BUBBLE_SIZE / 2
            : base.x + (moves ? (drag?.dx ?? 0) : 0),
          y: snapped
            ? zoneCenter.y - BUBBLE_SIZE / 2
            : base.y + (moves ? (drag?.dy ?? 0) : 0),
          z: moves ? 40 - order : 30 - (expanded ? 0 : depth),
          badge: expanded
            ? key === activeKey
              ? 0
              : (unread[key] ?? 0)
            : key === topKey
              ? totalUnread
              : 0,
        },
      ];
    });
  const placed = placedFor(visibleKeys);

  // ---- Panel box ----
  const panelWidth = Math.max(
    0,
    Math.min(size.width - SIDE_GAP, PANEL_MAX_WIDTH),
  );
  const keyboard = visualViewport
    ? Math.max(
        0,
        window.innerHeight - visualViewport.offsetTop - visualViewport.height,
      )
    : 0;
  const rowIndex = Math.max(
    0,
    visibleKeys.indexOf(activeKey ?? shownKey ?? ""),
  );
  const rowSpot = rowPositions(Math.max(1, visibleKeys.length), size)[rowIndex];
  const panelLeft = (size.width - panelWidth) / 2;
  const box: PanelBox = {
    left: panelLeft,
    top: PANEL_TOP,
    width: panelWidth,
    height: Math.max(
      MIN_PANEL_HEIGHT,
      size.height - PANEL_TOP - PANEL_GAP - keyboard,
    ),
    originX: (rowSpot?.x ?? 0) + BUBBLE_SIZE / 2 - panelLeft,
    originY: (rowSpot?.y ?? TOP_MIN) + BUBBLE_SIZE / 2 - PANEL_TOP,
  };
  const shownMeta = shownKey ? (metas[shownKey] ?? null) : null;

  const closeActive = (meta: BubbleMeta) => {
    exitBubble(placedFor([meta.key]));
    dispatch({ type: "close", key: meta.key });
    toast(t("closed", { name: meta.name }));
  };

  return (
    <div
      ref={layerRef}
      data-chat-bubbles
      className="pointer-events-none fixed inset-x-0 z-[35]"
      style={{
        top: "env(safe-area-inset-top)",
        bottom: "env(safe-area-inset-bottom)",
      }}
    >
      {size.width > 0 && (
        <>
          <div
            aria-hidden
            data-open={expanded}
            onClick={() => dispatch({ type: "collapse" })}
            className="cb-scrim absolute inset-0 z-20 bg-black/40"
          />
          <BubblePanel
            box={box}
            role={role}
            isOpen={expanded}
            meta={shownMeta}
            iframeRef={iframeRef}
            labels={{
              panel: t("panelLabel", { name: shownMeta?.name ?? "" }),
              loading: t("loading"),
              more: t("more"),
              collapse: t("collapse"),
              openFull: t("openFull"),
              mute: t("muteFor", { name: shownMeta?.name ?? "" }),
              close: t("closeThis"),
            }}
            onCollapse={() => dispatch({ type: "collapse" })}
            onOpenFull={() => {
              if (shownMeta) {
                dispatch({ type: "close", key: shownMeta.key });
                router.push(shownMeta.href);
              }
            }}
            onMute={() => {
              if (shownMeta) {
                exitBubble(placedFor([shownMeta.key]));
                dispatch({ type: "mute", key: shownMeta.key });
                toast(t("muted", { name: shownMeta.name }));
              }
            }}
            onClose={() => shownMeta && closeActive(shownMeta)}
          />
          <div
            aria-hidden
            data-open={isMoving}
            data-hot={isMoving && drag?.hot}
            className="cb-zone absolute left-1/2 z-[35] -ml-8 grid size-16 place-items-center rounded-full bg-black/70 text-white"
            style={{ bottom: ZONE_BOTTOM }}
          >
            <X className="size-7" strokeWidth={2.6} />
          </div>
          <div
            aria-hidden
            data-open={isMoving}
            className="cb-zone-label absolute inset-x-0 z-[35] text-center text-xs font-semibold text-white [text-shadow:0_1px_3px_rgb(0_0_0/0.6)]"
            style={{ bottom: ZONE_BOTTOM + ZONE_SIZE + 8 }}
          >
            {t("closeZone")}
          </div>
          {placed.map((item) => (
            <BubbleItem
              key={item.meta.key}
              meta={item.meta}
              x={item.x}
              y={item.y}
              z={item.z}
              side={state.anchor.side}
              badge={item.badge}
              label={t("bubbleLabel", { name: item.meta.name })}
              badgeLabel={t("unreadLabel", { count: item.badge })}
              isActive={expanded && item.meta.key === activeKey}
              isOnline={isMetaOnline(item.meta)}
              isDragging={isMoving && drag?.key === item.meta.key}
              handlers={handlersFor(item.meta.key)}
              onActivate={() =>
                dispatch(
                  expanded && item.meta.key === activeKey
                    ? { type: "collapse" }
                    : {
                        type: "expand",
                        key: expanded
                          ? item.meta.key
                          : (topKey ?? item.meta.key),
                      },
                )
              }
            />
          ))}
          {ghosts.map((item) => (
            <BubbleItem
              key={`exit:${item.meta.key}`}
              meta={item.meta}
              x={item.x}
              y={item.y}
              z={item.z}
              side={state.anchor.side}
              badge={0}
              label={item.meta.name}
              badgeLabel=""
              isActive={false}
              isOnline={isMetaOnline(item.meta)}
              isDragging={false}
              isExiting
            />
          ))}
        </>
      )}
    </div>
  );
};

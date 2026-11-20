import type { GroupHeader, GroupMessageView, GroupViewer } from "@pt/contracts";

import type { ThreadSnapshot } from "@/features/chat/hooks/use-chat-messages";
import {
  serializeMessage,
  type ServerChatMessage,
  type ThreadViewer,
} from "@/features/chat/utils/chat-thread-rules";

// Maps what the group routes and actions return (the API's GroupMessageView,
// file URLs already mapped to this app) onto the message shape the shared
// thread (useChatMessages, buildThreadItems, MessageBubble) draws. Pure, so it
// is tested without a browser.

export interface GroupThreadWire {
  messages: GroupMessageView[];
  hasMore: boolean;
  changes: GroupMessageView[];
  lastChangeAt: number;
  group: GroupHeader;
  viewer: GroupViewer;
}

const keyId = (key: string | null, kind: "admin" | "user") => {
  const [prefix, raw] = (key ?? "").split(":");

  return prefix === kind && /^[1-9]\d*$/.test(raw ?? "") ? Number(raw) : null;
};

// The aggregated chips of a group message as per-reactor entries, which is
// what the chips and my-reaction logic read. Others are anonymous here (the
// API sends counts, not names), so each gets a unique key.
const expandReactions = (view: GroupMessageView, viewerKey: string) =>
  view.reactions.flatMap((reaction) => {
    const others = Math.max(0, reaction.count - (reaction.mine ? 1 : 0));

    return [
      ...(reaction.mine
        ? [{ emoji: reaction.emoji, reactorKey: viewerKey, reactorName: "" }]
        : []),
      ...Array.from({ length: others }, (_, index) => ({
        emoji: reaction.emoji,
        reactorKey: `other:${view.id}:${reaction.emoji}:${index}`,
        reactorName: "",
      })),
    ];
  });

const toPhoto = (photo: GroupMessageView["photos"][number]) => ({
  url: photo.url,
  width: photo.width,
  height: photo.height,
  alt: photo.alt,
});

export const toChatMessage = (
  view: GroupMessageView,
  viewerKey: string,
): ServerChatMessage => {
  const isSystem = view.kind === "system";
  const adminId = keyId(view.senderKey, "admin");

  return {
    id: view.id,
    senderRole: adminId === null ? "user" : "admin",
    senderAdminId: adminId,
    senderAdminName: adminId === null ? null : view.senderName,
    body: view.body,
    sticker: view.sticker,
    photo: view.photo ? toPhoto(view.photo) : null,
    photos: view.photos.map(toPhoto),
    // System lines have no client id; the row id keeps the key unique.
    clientId: view.clientId ?? `system-${view.id}`,
    createdAt: view.createdAt,
    replyTo: view.replyTo
      ? {
          id: view.replyTo.id,
          body: view.replyTo.snippet,
          senderRole: "user",
          deleted: view.replyTo.unavailable,
          senderKey: view.replyTo.senderKey,
          senderName: view.replyTo.senderName,
          ...(view.replyTo.isSticker ? { isSticker: true } : {}),
          ...(view.replyTo.isPhoto ? { isPhoto: true } : {}),
          ...(view.replyTo.photoCount > 1
            ? { photoCount: view.replyTo.photoCount }
            : {}),
        }
      : null,
    editedAt: view.edited ? (view.updatedAt ?? view.createdAt) : null,
    deleted: view.deleted,
    updatedAt: view.updatedAt ?? view.createdAt,
    reactions: isSystem ? [] : expandReactions(view, viewerKey),
    senderKey: view.senderKey,
    senderName: view.senderName,
    senderDeleted: view.senderDeleted,
    senderTag: view.senderTag,
    kind: view.kind,
    systemEvent: view.systemEvent,
    eventNames: view.eventNames,
    audience: view.audience,
    hidden: view.hidden,
    seenCount: view.seenCount,
  };
};

export const toSerializedGroupMessage = (
  view: GroupMessageView,
  viewerKey: string,
) => serializeMessage(toChatMessage(view, viewerKey));

// Who may write right now: managers-only turns trainees into readers, a
// dissolved group is read-only, and `canWriteBase` carries what only the
// API knows about the person (chat switch, restriction).
export const canSendInGroup = ({
  dissolved,
  managersOnly,
  isManager,
  canWriteBase,
}: {
  dissolved: boolean;
  managersOnly: boolean;
  isManager: boolean;
  canWriteBase: boolean;
}) => !dissolved && canWriteBase && (!managersOnly || isManager);

export const groupViewer = (
  key: string,
  name: string,
): Extract<ThreadViewer, { role: "member" }> => ({
  role: "member",
  key,
  name,
});

// Why the composer is a banner because of the person (not the group): the
// trainee's chat switch is off or a super admin restricted them.
export type GroupLockReason = "chat_off" | "restricted";

export const lockReasonOf = (
  sendBlock: GroupViewer["sendBlock"],
): GroupLockReason | null =>
  sendBlock === "chat_off" || sendBlock === "restricted" ? sendBlock : null;

// The switches the thread watches while it is open: the banner that replaces
// the composer is chosen from them.
export interface GroupState {
  // The header: a rename or a new photo by a manager shows on the next fetch.
  name: string;
  avatarUrl: string | null;
  managersOnly: boolean;
  dissolved: boolean;
  // Super admin or PT member: may write under managers-only.
  isManager: boolean;
  // Super admin or the creator PT: may hide and unhide messages.
  canManage: boolean;
  // Sees the PT-change alert and its buttons, reports nothing.
  isSuperAdmin: boolean;
  lockReason: GroupLockReason | null;
}

export const groupStateOf = (payload: {
  group: Pick<GroupHeader, "name" | "avatarUrl" | "managersOnly" | "dissolved">;
  viewer: Pick<
    GroupViewer,
    "isManager" | "canManage" | "isSuperAdmin" | "sendBlock"
  >;
}): GroupState => ({
  name: payload.group.name,
  avatarUrl: payload.group.avatarUrl,
  managersOnly: payload.group.managersOnly,
  dissolved: payload.group.dissolved,
  isManager: payload.viewer.isManager,
  canManage: payload.viewer.canManage,
  isSuperAdmin: payload.viewer.isSuperAdmin,
  lockReason: lockReasonOf(payload.viewer.sendBlock),
});

export const isGroupThreadWire = (value: unknown): value is GroupThreadWire =>
  typeof value === "object" &&
  value !== null &&
  Array.isArray((value as GroupThreadWire).messages) &&
  Array.isArray((value as GroupThreadWire).changes) &&
  typeof (value as GroupThreadWire).hasMore === "boolean" &&
  typeof (value as GroupThreadWire).group === "object" &&
  (value as GroupThreadWire).group !== null &&
  typeof (value as GroupThreadWire).viewer === "object" &&
  (value as GroupThreadWire).viewer !== null;

// A route payload as the snapshot the shared hook keeps. `chatEnabled` is the
// group's "can I send" (a hint; every send is checked again by the API), from
// the payload's own viewer, so a restriction, a chat switch or managers-only
// that changed while the thread is open shows on the next fetch.
export const toThreadSnapshot = (
  payload: GroupThreadWire,
  viewerKey: string,
): ThreadSnapshot => ({
  messages: payload.messages.map((view) =>
    toSerializedGroupMessage(view, viewerKey),
  ),
  changes: payload.changes.map((view) =>
    toSerializedGroupMessage(view, viewerKey),
  ),
  hasMore: payload.hasMore,
  lastChangeAt: payload.lastChangeAt,
  chatEnabled: canSendInGroup({
    dissolved: payload.group.dissolved,
    managersOnly: payload.group.managersOnly,
    isManager: payload.viewer.isManager,
    canWriteBase: lockReasonOf(payload.viewer.sendBlock) === null,
  }),
  // The one to one "seen" cursor does not exist in groups.
  peerReadUpTo: 0,
});

export const parseGroupThread = (
  raw: unknown,
  viewerKey: string,
): ThreadSnapshot | null =>
  isGroupThreadWire(raw) ? toThreadSnapshot(raw, viewerKey) : null;

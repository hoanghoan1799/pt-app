import type { AdminRole } from "../auth/constants.js";
import {
  GROUP_MEMBER_CAP,
  GROUP_MESSAGES,
  GROUP_NAME_MAX_LENGTH,
  GROUP_NAME_MIN_LENGTH,
  type GroupRole,
  type GroupSenderTag,
} from "./constants.js";
import { GROUP_MEMBER_KEY_PATTERN } from "./system-event.js";
import { z } from "zod";

// The pure rules of group chat (company utils/group-rules.ts and
// group-unread.ts): who is in, who may manage, who may send, the add scope,
// the cap, unread and seen-by. The API applies them; the SQL repeats the
// unread predicate and the tests keep the two in step.

// Who is asking, from the session.
export type GroupSession =
  { kind: "user"; id: number } | { kind: "admin"; id: number; role: AdminRole };

export type GroupActor = {
  // "user:<id>" | "admin:<id>", the member key.
  key: string;
  kind: "user" | "admin";
  id: number;
  role: GroupRole;
  isMember: boolean;
  // Super admin, or the PT recorded in created_by_key (G6).
  canManage: boolean;
  // Super admin or PT member: may send when managers-only is on (G4).
  isManager: boolean;
  isSuperAdmin: boolean;
};

export const groupSessionKey = (session: GroupSession) =>
  `${session.kind}:${session.id}`;

export const isGroupMemberKey = (value: string) =>
  GROUP_MEMBER_KEY_PATTERN.test(value);

// Trimmed, inner whitespace collapsed, 1..60 characters (code points, not
// UTF-16 units), no control characters.
export const groupNameSchema = z
  .string(GROUP_MESSAGES.NAME_INVALID)
  .transform((value) => value.trim().replace(/\s+/g, " "))
  .refine((value) => {
    const length = Array.from(value).length;

    return (
      length >= GROUP_NAME_MIN_LENGTH &&
      length <= GROUP_NAME_MAX_LENGTH &&
      !/\p{Cc}/u.test(value)
    );
  }, GROUP_MESSAGES.NAME_INVALID);

export type GroupAccessInput = {
  session: GroupSession;
  group: { createdByKey: string; dissolvedAt: Date | null };
  // The member row of this person; null = none.
  member: { leftAt: Date | null } | null;
};

// The actor of a request, or null when the group must answer "not found": a
// super admin is always in (even a dissolved group, read-only); everyone else
// needs an active member row in a group that is not dissolved. Missing group,
// dissolved, non-member and left member are indistinguishable.
export const buildGroupActor = ({
  session,
  group,
  member,
}: GroupAccessInput): GroupActor | null => {
  const key = groupSessionKey(session);

  if (session.kind === "admin" && session.role === "super_admin") {
    return {
      key,
      kind: "admin",
      id: session.id,
      role: "super_admin",
      isMember: true,
      canManage: true,
      isManager: true,
      isSuperAdmin: true,
    };
  }
  if (group.dissolvedAt !== null || !member || member.leftAt !== null) {
    return null;
  }
  const role: GroupRole = session.kind === "admin" ? "pt" : "trainee";

  return {
    key,
    kind: session.kind,
    id: session.id,
    role,
    isMember: true,
    canManage: role === "pt" && key === group.createdByKey,
    isManager: role === "pt",
    isSuperAdmin: false,
  };
};

export const GROUP_SEND_BLOCK_REASONS = [
  "dissolved",
  "left",
  "managers_only",
  "chat_off",
  "restricted",
] as const;
export type GroupSendBlockReason = (typeof GROUP_SEND_BLOCK_REASONS)[number];

export type GroupSendBlockInput = {
  actor: GroupActor;
  dissolved: boolean;
  managersOnly: boolean;
  // users.chat_enabled === true; ignored for admins.
  chatEnabled: boolean;
  // A super admin restricted the trainee; ignored for admins.
  restricted: boolean;
  // Reactions, edits and unsend stay possible under managers-only.
  ignoreManagersOnly?: boolean;
};

// The one decision for every write into a group (G10); reading is never
// blocked here. The UI state is a hint, every write asks again on the server.
export const groupSendBlockReason = ({
  actor,
  dissolved,
  managersOnly,
  chatEnabled,
  restricted,
  ignoreManagersOnly = false,
}: GroupSendBlockInput): GroupSendBlockReason | null => {
  if (dissolved) {
    return "dissolved";
  }
  if (!actor.isMember) {
    return "left";
  }
  if (managersOnly && !actor.isManager && !ignoreManagersOnly) {
    return "managers_only";
  }
  if (actor.kind === "user") {
    if (!chatEnabled) {
      return "chat_off";
    }
    if (restricted) {
      return "restricted";
    }
  }
  return null;
};

export const GROUP_ADD_OUTCOMES = [
  "added",
  "invalid",
  "not_found",
  "not_trainee",
  "out_of_scope",
  "already_member",
  "cap_reached",
] as const;
export type GroupAddOutcome = (typeof GROUP_ADD_OUTCOMES)[number];

export type GroupAddTarget = {
  kind: "user" | "admin";
  // For an admin target: whether it is a PT account.
  isPt?: boolean;
  // For a trainee target and a PT caller: the PT may open this trainee (own
  // and not hidden, unless revealed). Super admins skip it.
  accessible?: boolean;
};

// G1 / G3: a super admin adds any trainee and any PT; a PT adds only own,
// visible trainees and never another PT. Null = allowed.
export const groupAddScopeOutcome = (
  actor: GroupActor,
  target: GroupAddTarget,
): GroupAddOutcome | null => {
  if (target.kind === "admin") {
    if (!target.isPt) {
      return "not_trainee";
    }
    return actor.isSuperAdmin ? null : "out_of_scope";
  }
  if (actor.isSuperAdmin) {
    return null;
  }
  return actor.kind === "admin" && target.accessible === true
    ? null
    : "out_of_scope";
};

// Free places for explicit active members (G9; super admin state rows are not
// counted by the caller).
export const groupMemberCapRoom = (activeCount: number) =>
  Math.max(0, GROUP_MEMBER_CAP - Math.max(0, activeCount));

export const groupCanFitMembers = (activeCount: number, adding: number) =>
  adding <= groupMemberCapRoom(activeCount);

export const groupSenderTagOf = (
  role: GroupRole | undefined,
): GroupSenderTag | null =>
  role === "super_admin" ? "manager" : role === "pt" ? "pt" : null;

// --- Unread and seen-by (G12) --------------------------------------------

export type GroupUnreadCandidate = {
  id: number;
  kind: "message" | "system";
  senderKey: string | null;
  audience: "super_admin" | null;
  deletedAt: Date | null;
  hiddenAt: Date | null;
  createdAt: Date;
};

export type GroupUnreadViewer = {
  key: string;
  // NULL (nothing read) counts as 0.
  lastReadMessageId: number | null;
  // Super admins without a state row: messages before the account existed
  // never count.
  baselineAt?: Date | null;
};

// Unread excludes own messages, system lines (alerts included), unsent and
// hidden messages. Muting does not change it.
export const isGroupUnreadFor = (
  message: GroupUnreadCandidate,
  viewer: GroupUnreadViewer,
): boolean =>
  message.id > (viewer.lastReadMessageId ?? 0) &&
  message.kind === "message" &&
  message.senderKey !== viewer.key &&
  message.audience === null &&
  message.deletedAt === null &&
  message.hiddenAt === null &&
  (!viewer.baselineAt ||
    message.createdAt.getTime() >= viewer.baselineAt.getTime());

export const countGroupUnreadFor = (
  messages: readonly GroupUnreadCandidate[],
  viewer: GroupUnreadViewer,
) => messages.filter((message) => isGroupUnreadFor(message, viewer)).length;

export type GroupReaderCursor = {
  memberKey: string;
  lastReadMessageId: number | null;
};

// Members other than the sender whose cursor is at or past the message.
export const groupSeenByKeys = (
  message: { id: number; senderKey: string | null },
  cursors: readonly GroupReaderCursor[],
): string[] =>
  cursors
    .filter(
      (cursor) =>
        cursor.memberKey !== message.senderKey &&
        (cursor.lastReadMessageId ?? 0) >= message.id,
    )
    .map((cursor) => cursor.memberKey);

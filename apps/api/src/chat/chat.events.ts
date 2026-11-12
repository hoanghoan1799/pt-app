import { Injectable } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { InjectPinoLogger, PinoLogger } from "nestjs-pino";

// Domain events of the chat, emitted after the change is committed. Step 8b
// (Socket.IO gateway, web push) listens to them; the chat never imports a
// sender. Payloads are ids and flags; `body` rides on `chat.message.sent` only
// so a push listener can build its preview (never log it).

export const CHAT_EVENTS = {
  messageSent: "chat.message.sent",
  messageEdited: "chat.message.edited",
  messageDeleted: "chat.message.deleted",
  reactionChanged: "chat.reaction.changed",
  read: "chat.read",
  statusChanged: "chat.status.changed",
  profileChanged: "chat.profile.changed",
  dmMessageDeleted: "dm.message.deleted",
  dmRead: "dm.read",
} as const;

type Common = {
  conversationId: number;
  // The conversation's trainee (owner of the PT-side room).
  traineeUserId: number;
};

export type ChatMessageSentEvent = Common & {
  messageId: number;
  clientId: string;
  senderRole: "user" | "admin";
  senderAdminId: number | null;
  // /imlang: store and publish, but no push.
  silent: boolean;
  body: string;
  hasSticker: boolean;
  hasPhoto: boolean;
  replyToMessageId: number | null;
};

export type ChatMessageEditedEvent = Common & {
  messageId: number;
  // The new change cursor of the conversation.
  changedAt: number;
};

export type ChatMessageDeletedEvent = ChatMessageEditedEvent;

export type ChatReactionChangedEvent = Common & {
  messageId: number;
  changedAt: number;
  reactorKey: string;
  reactorName: string;
  // Null when the reaction was removed.
  emoji: string | null;
  previousEmoji: string | null;
  authorRole: "user" | "admin";
  authorAdminId: number | null;
};

export type ChatReadEvent = Common & {
  readerKey: string;
  lastReadMessageId: number;
};

export type ChatStatusChangedEvent = {
  userId: number;
  conversationId: number | null;
  enabled: boolean;
};

export type ChatProfileChangedEvent = Common & { changedAt: number };

export type DmMessageDeletedEvent = {
  conversationId: number;
  messageId: number;
  senderId: number;
};

export type DmReadEvent = {
  conversationId: number;
  userId: number;
  lastReadMessageId: number;
};

// Emits events and never lets a listener break the request that is already
// committed.
@Injectable()
export class ChatEvents {
  constructor(
    private readonly emitter: EventEmitter2,
    @InjectPinoLogger(ChatEvents.name) private readonly logger: PinoLogger,
  ) {}

  publish(name: string, payload: object) {
    try {
      this.emitter.emit(name, payload);
    } catch (error) {
      this.logger.error({ err: error, event: name }, "Event listener failed");
    }
  }
}

import { Injectable } from "@nestjs/common";
import { conversationRoom, REALTIME_EVENTS } from "@pt/contracts";

import type { AuthActor } from "../auth/actor.js";
import { ChatAccess, type ChatContext } from "../chat/chat.access.js";
import { chatErrors } from "../chat/chat.errors.js";
import { Clock } from "../common/clock.js";
import { RealtimeHub } from "./realtime.hub.js";
import { TypingLimiter } from "./typing.limiter.js";

// "đang nhập": the sender must be allowed to write in the conversation (the
// same rule as the old POST /api/chat/typing: a locked chat is refused), and
// is rate-limited. Nothing is stored; a lost event only hides the indicator.
@Injectable()
export class TypingService {
  private readonly limiter = new TypingLimiter();

  constructor(
    private readonly access: ChatAccess,
    private readonly hub: RealtimeHub,
    private readonly clock: Clock,
  ) {}

  // `senderId` identifies the rate-limit bucket (a socket id, or the REST
  // caller). Returns whether the event was relayed; rejects with the chat
  // errors (404 / chat locked) otherwise.
  async relay(
    actor: AuthActor,
    requestedConversationId: number | undefined,
    senderId: string,
    exceptSocketId?: string,
  ) {
    if (
      !this.limiter.allow(
        senderId,
        requestedConversationId ?? 0,
        this.clock.now().getTime(),
      )
    ) {
      return false;
    }
    const context = await this.resolve(actor, requestedConversationId);

    this.access.requireWrite(context);
    await this.hub.perform([
      {
        event: REALTIME_EVENTS.typing,
        data: {
          role: actor.kind === "user" ? "user" : "admin",
          senderKey: `${actor.kind}:${actor.id}`,
          conversationId: context.conversation.id,
        },
        rooms: [conversationRoom(context.conversation.id)],
        guardTraineeUserId: context.trainee.traineeId,
        exceptSocketId,
      },
    ]);
    return true;
  }

  forget(senderId: string) {
    this.limiter.forget(senderId);
  }

  private async resolve(
    actor: AuthActor,
    requested: number | undefined,
  ): Promise<ChatContext & { conversation: { id: number } }> {
    if (actor.kind === "user") {
      const context = await this.access.own(actor);

      // No conversation yet means nobody is listening.
      if (!context.conversation) {
        throw chatErrors.conversationNotFound();
      }
      return { ...context, conversation: context.conversation };
    }
    if (requested === undefined) {
      throw chatErrors.conversationNotFound();
    }
    return this.access.forConversation(actor, requested);
  }
}

import { Injectable } from "@nestjs/common";

import type { AuthActor } from "../auth/actor.js";
import { TraineeNotFoundError } from "../auth/auth.errors.js";
import { chatErrors } from "./chat.errors.js";
import { ChatPolicy } from "./chat.policy.js";
import {
  ChatQueries,
  type ConversationRow,
  type TraineeFactsRow,
} from "./chat.queries.js";

// A conversation (or the place one will be) the caller was allowed into.
export type ChatContext = {
  // Null until the first message of a trainee that has none yet.
  conversation: ConversationRow | null;
  trainee: TraineeFactsRow;
  actor: AuthActor;
};

// Resolves what a request is about and asks the ChatPolicy. Anything the
// caller may not read answers "not found" so ids reveal nothing. Locked chat:
// reads are fine (D5), writes call `requireWrite`.
@Injectable()
export class ChatAccess {
  constructor(
    private readonly queries: ChatQueries,
    private readonly policy: ChatPolicy,
  ) {}

  private adminIdOf(actor: AuthActor) {
    return actor.kind === "admin" ? actor.id : null;
  }

  // A trainee's own conversation (`/conversations/me`).
  async own(actor: AuthActor): Promise<ChatContext> {
    if (actor.kind !== "user") {
      throw chatErrors.conversationNotFound();
    }
    return this.forTrainee(actor, actor.id, chatErrors.userNotFound);
  }

  // An admin working with one trainee (the conversation may not exist yet).
  forTraineeId(actor: AuthActor, userId: number): Promise<ChatContext> {
    return this.forTrainee(actor, userId, () => new TraineeNotFoundError());
  }

  // The conversation of a trainee whose chat is on exists from the moment the
  // PT switched it on; for one that predates that (or was seeded without) it is
  // created here, on the first read. Idempotent and race-safe; a trainee with
  // chat off gets none.
  async ensureConversation(
    context: ChatContext,
  ): Promise<ConversationRow | null> {
    if (context.conversation) {
      return context.conversation;
    }
    return context.trainee.chatEnabled
      ? this.queries.getOrCreateConversation(context.trainee.traineeId)
      : null;
  }

  async forConversation(
    actor: AuthActor,
    conversationId: number,
  ): Promise<ChatContext & { conversation: ConversationRow }> {
    const conversation =
      await this.queries.findConversationById(conversationId);

    if (!conversation) {
      throw chatErrors.conversationNotFound();
    }
    const trainee = await this.queries.findTraineeFacts(
      conversation.userId,
      this.adminIdOf(actor),
    );

    if (!trainee || !this.policy.canRead(actor, trainee)) {
      throw chatErrors.conversationNotFound();
    }
    return { conversation, trainee, actor };
  }

  // The conversation a message lives in; a message of a conversation the
  // caller cannot read is "not found", never "not yours".
  async forMessage(actor: AuthActor, messageId: number) {
    const stored = await this.queries.findStoredMessage(messageId);

    if (!stored) {
      throw chatErrors.messageNotFound();
    }
    try {
      const context = await this.forConversation(actor, stored.conversationId);

      return { ...context, stored };
    } catch {
      throw chatErrors.messageNotFound();
    }
  }

  // Writes need the chat switched on for the trainee (D5, D6).
  requireWrite(context: ChatContext) {
    if (!this.policy.canWrite(context.actor, context.trainee)) {
      throw chatErrors.chatLocked();
    }
  }

  private async forTrainee(
    actor: AuthActor,
    userId: number,
    notFound: () => Error,
  ): Promise<ChatContext> {
    const trainee = await this.queries.findTraineeFacts(
      userId,
      this.adminIdOf(actor),
    );

    if (!trainee || !this.policy.canRead(actor, trainee)) {
      throw notFound();
    }
    return {
      conversation: await this.queries.findConversationByUserId(userId),
      trainee,
      actor,
    };
  }
}

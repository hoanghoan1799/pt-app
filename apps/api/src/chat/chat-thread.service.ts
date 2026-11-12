import { Injectable } from "@nestjs/common";
import type { ChatThreadQuery, ChatThreadResponse } from "@pt/contracts";

import { ChatContext } from "./chat.access.js";
import { chatErrors } from "./chat.errors.js";
import { ChatQueries } from "./chat.queries.js";
import { ChatProfileService, EMPTY_PROFILE } from "./chat-profile.service.js";
import { ChatViews } from "./chat-views.service.js";

export type ThreadResult =
  { notModified: true } | { notModified: false; payload: ChatThreadResponse };

// Reads a thread for polling clients (cursor + changedSince, 204 when nothing
// changed). Reading stays allowed while chat is locked (D5).
@Injectable()
export class ChatThreadService {
  constructor(
    private readonly queries: ChatQueries,
    private readonly views: ChatViews,
    private readonly profiles: ChatProfileService,
  ) {}

  async load(
    context: ChatContext,
    query: ChatThreadQuery,
  ): Promise<ThreadResult> {
    const { actor, trainee, conversation } = context;
    const isTrainee = actor.kind === "user";

    if (!conversation) {
      return {
        notModified: false,
        payload: {
          messages: [],
          hasMore: false,
          changes: [],
          lastChangeAt: 0,
          profile: EMPTY_PROFILE,
          chatEnabled: trainee.chatEnabled,
          peerReadUpTo: 0,
          peerLastSeenAt:
            (await this.queries.adminTeamLastSeen())?.toISOString() ?? null,
          conversationId: null,
          latestPt: null,
        },
      };
    }
    const peerReadUpTo = await this.queries.peerReadCursor(
      conversation.id,
      isTrainee ? "user" : "admin",
    );
    const lastChangeAt = conversation.lastChangeAt?.getTime() ?? 0;

    // Only when everything the client holds is still current is "nothing
    // changed" a valid answer; a client that sends no `changedSince` keeps the
    // older rule. Admin threads always answer in full.
    if (
      isTrainee &&
      query.after !== undefined &&
      query.after >= (conversation.lastMessageId ?? 0) &&
      query.readUpTo === peerReadUpTo &&
      query.enabled === trainee.chatEnabled &&
      (query.changedSince === undefined || lastChangeAt <= query.changedSince)
    ) {
      return { notModified: true };
    }
    const page =
      query.around === undefined
        ? await this.queries.listMessageRows(conversation.id, query)
        : await this.queries.listRowsAround(conversation.id, query.around);

    if (!page) {
      throw chatErrors.messageNotFound();
    }
    const changed =
      query.changedSince === undefined
        ? { rows: [], lastChangeAt }
        : await this.queries.listChangeRows(
            conversation.id,
            query.changedSince,
            lastChangeAt,
          );
    const [messages, changes, profile, teamLastSeen, latestPt] =
      await Promise.all([
        this.views.many(page.rows, actor),
        this.views.many(changed.rows, actor),
        this.profiles.load(conversation.id, actor, trainee.traineeId),
        isTrainee ? this.queries.adminTeamLastSeen() : trainee.lastSeenAt,
        this.queries.latestAdminSender(conversation.id),
      ]);

    return {
      notModified: false,
      payload: {
        messages,
        hasMore: page.hasMore,
        changes,
        lastChangeAt: changed.lastChangeAt,
        profile,
        chatEnabled: trainee.chatEnabled,
        peerReadUpTo,
        peerLastSeenAt: teamLastSeen?.toISOString() ?? null,
        conversationId: conversation.id,
        latestPt,
        ...(isTrainee ? {} : { userId: trainee.traineeId }),
      },
    };
  }

  // Previous bodies of a message, visible to everyone in the conversation
  // (C4). An unsent message shows no history.
  async edits(messageId: number, storedDeleted: boolean) {
    if (storedDeleted) {
      return [];
    }
    return (await this.queries.listEditHistory(messageId)).map((row) => ({
      previousBody: row.previousBody,
      editedAt: row.editedAt.toISOString(),
    }));
  }
}

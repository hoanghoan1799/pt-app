import { Injectable, Logger } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";

import { ADMIN_EVENTS } from "../admins/admins.events.js";
import {
  SESSION_EVENTS,
  type SessionLockedEvent,
  type SessionRevokedAllEvent,
  type SessionRevokedEvent,
} from "../auth/session.events.js";
import {
  CHAT_EVENTS,
  type ChatMessageDeletedEvent,
  type ChatMessageEditedEvent,
  type ChatMessageSentEvent,
  type ChatProfileChangedEvent,
  type ChatReactionChangedEvent,
  type ChatReadEvent,
  type ChatStatusChangedEvent,
  type DmMessageDeletedEvent,
  type DmReadEvent,
} from "../chat/chat.events.js";
import { ChatQueries } from "../chat/chat.queries.js";
import {
  type Emission,
  mapDmDeleted,
  mapDmRead,
  mapMessageSent,
  mapMessageUpdated,
  mapProfileChanged,
  mapRead,
  mapStatusChanged,
} from "./event-mapping.js";
import { PresenceService } from "./presence.service.js";
import { RealtimeHub } from "./realtime.hub.js";

// Domain events -> sockets. Chat never knows about sockets; a failing listener
// is logged and never reaches the request that was already committed.
@Injectable()
export class RealtimeListeners {
  private readonly logger = new Logger(RealtimeListeners.name);

  constructor(
    private readonly hub: RealtimeHub,
    private readonly chatQueries: ChatQueries,
    private readonly presence: PresenceService,
  ) {}

  private async run(
    name: string,
    build: () => Promise<Emission[]> | Emission[],
  ) {
    try {
      await this.hub.perform(await build());
    } catch (error) {
      this.logger.error(
        `Realtime fan-out of ${name} failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  @OnEvent(CHAT_EVENTS.messageSent)
  onMessageSent(event: ChatMessageSentEvent) {
    return this.run(CHAT_EVENTS.messageSent, async () => {
      const facts = await this.chatQueries.findTraineeFacts(
        event.traineeUserId,
        null,
      );

      return mapMessageSent(event, facts?.ptAdminId ?? null);
    });
  }

  @OnEvent(CHAT_EVENTS.messageEdited)
  onMessageEdited(event: ChatMessageEditedEvent) {
    return this.run(CHAT_EVENTS.messageEdited, () => mapMessageUpdated(event));
  }

  @OnEvent(CHAT_EVENTS.messageDeleted)
  onMessageDeleted(event: ChatMessageDeletedEvent) {
    return this.run(CHAT_EVENTS.messageDeleted, () => mapMessageUpdated(event));
  }

  @OnEvent(CHAT_EVENTS.reactionChanged)
  onReaction(event: ChatReactionChangedEvent) {
    return this.run(CHAT_EVENTS.reactionChanged, () =>
      mapMessageUpdated(event),
    );
  }

  @OnEvent(CHAT_EVENTS.read)
  onRead(event: ChatReadEvent) {
    return this.run(CHAT_EVENTS.read, () => mapRead(event));
  }

  @OnEvent(CHAT_EVENTS.statusChanged)
  onStatus(event: ChatStatusChangedEvent) {
    return this.run(CHAT_EVENTS.statusChanged, () => mapStatusChanged(event));
  }

  @OnEvent(CHAT_EVENTS.profileChanged)
  onProfile(event: ChatProfileChangedEvent) {
    return this.run(CHAT_EVENTS.profileChanged, () => mapProfileChanged(event));
  }

  @OnEvent(CHAT_EVENTS.dmMessageDeleted)
  onDmDeleted(event: DmMessageDeletedEvent) {
    return this.run(CHAT_EVENTS.dmMessageDeleted, () => mapDmDeleted(event));
  }

  @OnEvent(CHAT_EVENTS.dmRead)
  onDmRead(event: DmReadEvent) {
    return this.run(CHAT_EVENTS.dmRead, () => mapDmRead(event));
  }

  // --- Sessions and presence ----------------------------------------------------

  @OnEvent(SESSION_EVENTS.revoked)
  onSessionRevoked(event: SessionRevokedEvent) {
    return this.hub.revokeSession(event.sessionId, "signed_out");
  }

  @OnEvent(SESSION_EVENTS.locked)
  onSessionLocked(event: SessionLockedEvent) {
    return this.hub.revokeSession(event.sessionId, "locked");
  }

  @OnEvent(SESSION_EVENTS.revokedAll)
  onSessionsRevoked(event: SessionRevokedAllEvent) {
    return this.hub.revokeAccount(
      event.kind,
      event.id,
      event.exceptSessionId,
      "signed_out",
    );
  }

  @OnEvent(ADMIN_EVENTS.presenceHiddenChanged)
  async onPresenceHidden() {
    try {
      await this.presence.hiddenChanged();
    } catch (error) {
      this.logger.error(
        `Presence broadcast failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

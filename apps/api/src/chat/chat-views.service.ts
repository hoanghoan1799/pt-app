import { Injectable } from "@nestjs/common";
import type { ChatMessageView } from "@pt/contracts";

import type { AuthActor } from "../auth/actor.js";
import { type MessageRow, toMessageViews } from "./chat.mapper.js";
import { ChatQueries } from "./chat.queries.js";

// Message rows -> DTOs for one viewer (the quoted post is checked per viewer
// on every read, so a post made private later never leaks through the chat).
@Injectable()
export class ChatViews {
  constructor(private readonly queries: ChatQueries) {}

  async many(
    rows: MessageRow[],
    viewer?: AuthActor,
  ): Promise<ChatMessageView[]> {
    return toMessageViews(rows, await this.queries.loadContext(rows, viewer));
  }

  async one(
    messageId: number,
    viewer?: AuthActor,
  ): Promise<ChatMessageView | null> {
    const row = await this.queries.findMessageRow(messageId);

    return row ? (await this.many([row], viewer))[0] : null;
  }
}

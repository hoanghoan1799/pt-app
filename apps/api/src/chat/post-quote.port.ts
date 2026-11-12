import { Injectable } from "@nestjs/common";
import type { chatPostQuoteSchema } from "@pt/contracts";
import type { z } from "zod";

import type { AuthActor } from "../auth/actor.js";

export type ChatPostQuote = z.infer<typeof chatPostQuoteSchema>;

// "Reply to a post" in the coach chat needs the social post rules (who may see
// a post). They belong to the Social module, so the chat only talks to this
// port. Until Social provides an implementation the default refuses every
// quote and shows no post.
export const CHAT_POST_QUOTES = Symbol("CHAT_POST_QUOTES");

export interface ChatPostQuoteReader {
  // The post must be one the sender may see and the other side wrote: a PT or
  // super admin post for a trainee, a post of this conversation's trainee for
  // a PT.
  canQuote(
    sender: AuthActor,
    postId: number,
    traineeId: number,
  ): Promise<boolean>;
  // The quoted post as `viewer` may see it (`available: false` once they may
  // not), by post id.
  views(
    viewer: AuthActor,
    postIds: readonly number[],
  ): Promise<Map<number, ChatPostQuote>>;
}

@Injectable()
export class NoPostQuotes implements ChatPostQuoteReader {
  canQuote() {
    return Promise.resolve(false);
  }

  views() {
    return Promise.resolve(new Map<number, ChatPostQuote>());
  }
}

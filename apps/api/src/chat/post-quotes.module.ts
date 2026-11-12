import { Module } from "@nestjs/common";

import { SocialPostQuotes } from "../social/post-quotes.adapter.js";
import { SocialModule } from "../social/social.module.js";
import { CHAT_POST_QUOTES } from "./post-quote.port.js";

// Provides the CHAT_POST_QUOTES port to the chat and the trainee DMs: the
// Social module decides which posts may be quoted and how they show.
@Module({
  imports: [SocialModule],
  providers: [{ provide: CHAT_POST_QUOTES, useExisting: SocialPostQuotes }],
  exports: [CHAT_POST_QUOTES],
})
export class PostQuotesModule {}

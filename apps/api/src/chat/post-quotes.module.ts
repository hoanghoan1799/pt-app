import { Module } from "@nestjs/common";

import { CHAT_POST_QUOTES, NoPostQuotes } from "./post-quote.port.js";

// Provides the CHAT_POST_QUOTES port to the chat and the trainee DMs. The
// Social module replaces `useClass` with its own reader when it lands.
@Module({
  providers: [{ provide: CHAT_POST_QUOTES, useClass: NoPostQuotes }],
  exports: [CHAT_POST_QUOTES],
})
export class PostQuotesModule {}

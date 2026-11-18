import { Module } from "@nestjs/common";

import { ChatEvents } from "./chat.events.js";
import { ChatModeration } from "./chat-moderation.service.js";

// Just the moderation of chat messages, so Social (which Chat imports) can
// hide a reported message without importing the whole ChatModule.
@Module({
  providers: [ChatEvents, ChatModeration],
  exports: [ChatModeration],
})
export class ChatModerationModule {}

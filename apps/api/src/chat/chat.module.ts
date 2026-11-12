import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { ContactAliasesModule } from "../contact-aliases/contact-aliases.module.js";
import { DmModule } from "../dm/dm.module.js";
import { FilesModule } from "../files/files.module.js";
import { StickersModule } from "../stickers/stickers.module.js";
import { ChatAccess } from "./chat.access.js";
import { ChatEvents } from "./chat.events.js";
import { ChatPolicy } from "./chat.policy.js";
import { ChatQueries } from "./chat.queries.js";
import { ChatService } from "./chat.service.js";
import { ChatConversationsController } from "./chat-conversations.controller.js";
import { ChatGalleryService } from "./chat-gallery.service.js";
import { ChatInboxService } from "./chat-inbox.service.js";
import { ChatMessagesController } from "./chat-messages.controller.js";
import { ChatPhotosService } from "./chat-photos.service.js";
import { ChatProfileService } from "./chat-profile.service.js";
import { ChatSearchService } from "./chat-search.service.js";
import { ChatThreadService } from "./chat-thread.service.js";
import { ChatViews } from "./chat-views.service.js";
import { PostQuotesModule } from "./post-quotes.module.js";

// Trainee-PT chat over REST: threads (cursor + changedSince polling), send /
// edit / unsend / react / read, photos, search, gallery, inbox and badges.
// Every change emits a domain event (chat.message.sent, ...) that the realtime
// gateway and web push listen to in step 8b; nothing here knows about them.
@Module({
  imports: [
    AuthModule,
    FilesModule,
    StickersModule,
    DmModule,
    ContactAliasesModule,
    PostQuotesModule,
  ],
  controllers: [ChatConversationsController, ChatMessagesController],
  providers: [
    ChatPolicy,
    ChatQueries,
    ChatAccess,
    ChatViews,
    ChatEvents,
    ChatService,
    ChatThreadService,
    ChatProfileService,
    ChatPhotosService,
    ChatSearchService,
    ChatGalleryService,
    ChatInboxService,
  ],
  exports: [
    ChatPolicy,
    ChatEvents,
    ChatAccess,
    ChatQueries,
    ChatProfileService,
  ],
})
export class ChatModule {}

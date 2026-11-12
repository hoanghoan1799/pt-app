import { Module } from "@nestjs/common";

import { ChatEvents } from "../chat/chat.events.js";
import { PostQuotesModule } from "../chat/post-quotes.module.js";
import { ContactAliasesModule } from "../contact-aliases/contact-aliases.module.js";
import { FilesModule } from "../files/files.module.js";
import { DmController } from "./dm.controller.js";
import { DmQueries } from "./dm.queries.js";
import { DmService } from "./dm.service.js";

// Trainee-to-trainee chat, read-only (sending disabled). Never touches the
// social_* tables except to read the block list.
@Module({
  imports: [FilesModule, ContactAliasesModule, PostQuotesModule],
  controllers: [DmController],
  providers: [DmQueries, DmService, ChatEvents],
  exports: [DmQueries],
})
export class DmModule {}

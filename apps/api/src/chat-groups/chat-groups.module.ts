import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { ChatEvents } from "../chat/chat.events.js";
import { FilesModule } from "../files/files.module.js";
import { StickersModule } from "../stickers/stickers.module.js";
import { GroupAccess } from "./group.access.js";
import { GroupQueries } from "./group.queries.js";
import { GroupAlertsService } from "./group-alerts.service.js";
import { GroupInboxService } from "./group-inbox.service.js";
import { GroupMembershipService } from "./group-membership.service.js";
import { GroupMessagesController } from "./group-messages.controller.js";
import { GroupMessagesService } from "./group-messages.service.js";
import { GroupNames } from "./group-names.service.js";
import { GroupPhotosService } from "./group-photos.service.js";
import { GroupViews } from "./group-views.service.js";
import { GroupsController } from "./groups.controller.js";

// Group chat over REST (company features/chat-groups): lists, threads, send /
// edit / unsend / react / hide / read, members and settings, photos, the
// PT-change alert. Every change emits a domain event (chat_group.*) that the
// realtime gateway and web push listen to; nothing here knows about them.
@Module({
  imports: [AuthModule, FilesModule, StickersModule],
  controllers: [GroupsController, GroupMessagesController],
  providers: [
    ChatEvents,
    GroupQueries,
    GroupNames,
    GroupAccess,
    GroupViews,
    GroupMessagesService,
    GroupMembershipService,
    GroupAlertsService,
    GroupInboxService,
    GroupPhotosService,
  ],
  exports: [GroupAccess, GroupQueries, GroupAlertsService],
})
export class ChatGroupsModule {}

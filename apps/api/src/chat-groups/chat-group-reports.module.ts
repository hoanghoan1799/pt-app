import { Module } from "@nestjs/common";

import { ChatEvents } from "../chat/chat.events.js";
import { GroupQueries } from "./group.queries.js";
import { GroupReports } from "./group-reports.service.js";

// Just the reporting side of group chat, so Social can file and resolve a
// "group_message" report without importing the whole group module.
@Module({
  providers: [ChatEvents, GroupQueries, GroupReports],
  exports: [GroupReports],
})
export class ChatGroupReportsModule {}

import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { ChatModule } from "../chat/chat.module.js";
import { ContactAliasesModule } from "../contact-aliases/contact-aliases.module.js";
import { FilesModule } from "../files/files.module.js";
import { ProfileService } from "./profile.service.js";
import { TraineeDeletionService } from "./trainee-deletion.service.js";
import { TraineesController } from "./trainees.controller.js";
import { TraineesQueries } from "./trainees.queries.js";
import { TraineesService } from "./trainees.service.js";
import { MeController, UsersMeController } from "./users-me.controller.js";

@Module({
  imports: [AuthModule, ChatModule, ContactAliasesModule, FilesModule],
  controllers: [TraineesController, UsersMeController, MeController],
  providers: [
    TraineesService,
    TraineesQueries,
    TraineeDeletionService,
    ProfileService,
  ],
  exports: [ProfileService],
})
export class UsersModule {}

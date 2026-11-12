import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { AuthModule } from "../auth/auth.module.js";
import { ChatModule } from "../chat/chat.module.js";
import { ContactAliasesModule } from "../contact-aliases/contact-aliases.module.js";
import { Admin } from "../database/entities/admin.entity.js";
import { AdminHiddenUser } from "../database/entities/admin-hidden-user.entity.js";
import { FilesModule } from "../files/files.module.js";
import { AdminPasscodeController } from "./admin-passcode.controller.js";
import { AdminPasscodeService } from "./admin-passcode.service.js";
import {
  AdminAccountsController,
  AdminsMeController,
} from "./admins.controller.js";
import { AdminsService } from "./admins.service.js";
import { HiddenUsersController } from "./hidden-users.controller.js";
import { HiddenUsersService } from "./hidden-users.service.js";

@Module({
  imports: [
    TypeOrmModule.forFeature([Admin, AdminHiddenUser]),
    AuthModule,
    ChatModule,
    ContactAliasesModule,
    FilesModule,
  ],
  controllers: [
    AdminPasscodeController,
    AdminsMeController,
    AdminAccountsController,
    HiddenUsersController,
  ],
  providers: [AdminPasscodeService, AdminsService, HiddenUsersService],
})
export class AdminsModule {}

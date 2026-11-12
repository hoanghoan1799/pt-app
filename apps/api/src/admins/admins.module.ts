import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { AuthModule } from "../auth/auth.module.js";
import { Admin } from "../database/entities/admin.entity.js";
import { AdminHiddenUser } from "../database/entities/admin-hidden-user.entity.js";
import { AdminPasscodeController } from "./admin-passcode.controller.js";
import { AdminPasscodeService } from "./admin-passcode.service.js";

@Module({
  imports: [TypeOrmModule.forFeature([Admin, AdminHiddenUser]), AuthModule],
  controllers: [AdminPasscodeController],
  providers: [AdminPasscodeService],
})
export class AdminsModule {}

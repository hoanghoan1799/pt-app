import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { ContactAliasesController } from "./contact-aliases.controller.js";
import { ContactAliasesService } from "./contact-aliases.service.js";

@Module({
  imports: [AuthModule],
  controllers: [ContactAliasesController],
  providers: [ContactAliasesService],
  exports: [ContactAliasesService],
})
export class ContactAliasesModule {}

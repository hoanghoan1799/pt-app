import { Module } from "@nestjs/common";

import { ContactAliasesModule } from "../contact-aliases/contact-aliases.module.js";
import { AccountDirectory } from "./account-directory.service.js";

// The read-only account directory, on its own so modules that sit below Users
// in the import graph (Social) can use it without a cycle: UsersModule imports
// ChatModule, which imports Social.
@Module({
  imports: [ContactAliasesModule],
  providers: [AccountDirectory],
  exports: [AccountDirectory],
})
export class AccountDirectoryModule {}

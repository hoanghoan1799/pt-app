import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { FilesModule } from "../files/files.module.js";
import { CustomStickersService } from "./custom-stickers.service.js";
import { GIPHY_CLIENT, GiphyProxy, HttpGiphyClient } from "./giphy.js";
import { StickersController } from "./stickers.controller.js";

// Personal stickers and the GIPHY proxy. GIPHY sits behind the GIPHY_CLIENT
// port, so tests (and another source) replace the HTTP adapter.
@Module({
  imports: [AuthModule, FilesModule],
  controllers: [StickersController],
  providers: [
    CustomStickersService,
    GiphyProxy,
    { provide: GIPHY_CLIENT, useClass: HttpGiphyClient },
  ],
  exports: [CustomStickersService],
})
export class StickersModule {}

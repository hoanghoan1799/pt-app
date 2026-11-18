import { Module } from "@nestjs/common";

import { SocialModule } from "../social/social.module.js";
import { AvatarsController } from "./avatars.controller.js";
import { FilesModule } from "./files.module.js";

// The route that serves profile photos. Separate from FilesModule because the
// access rules live in Social, which imports FilesModule.
@Module({
  imports: [FilesModule, SocialModule],
  controllers: [AvatarsController],
})
export class AvatarsModule {}

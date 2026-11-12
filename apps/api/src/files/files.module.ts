import { Module } from "@nestjs/common";

import { AvatarService } from "./avatar.service.js";
import { AvatarsController } from "./avatars.controller.js";
import { BytesInPostgresStorage } from "./bytes-in-postgres.storage.js";
import { FILE_STORAGE } from "./file-storage.js";

// Image storage behind the FILE_STORAGE port (bytes in PostgreSQL for now),
// the avatar use cases and the route that serves them.
@Module({
  controllers: [AvatarsController],
  providers: [
    { provide: FILE_STORAGE, useClass: BytesInPostgresStorage },
    AvatarService,
  ],
  exports: [FILE_STORAGE, AvatarService],
})
export class FilesModule {}

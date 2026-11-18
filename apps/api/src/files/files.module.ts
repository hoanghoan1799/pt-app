import { Module } from "@nestjs/common";

import { AvatarService } from "./avatar.service.js";
import { BytesInPostgresStorage } from "./bytes-in-postgres.storage.js";
import { FILE_STORAGE } from "./file-storage.js";

// Image storage behind the FILE_STORAGE port (bytes in PostgreSQL for now),
// and the avatar use cases. The route lives in AvatarsModule, which also
// needs the social access rules (Social imports this module).
@Module({
  providers: [
    { provide: FILE_STORAGE, useClass: BytesInPostgresStorage },
    AvatarService,
  ],
  exports: [FILE_STORAGE, AvatarService],
})
export class FilesModule {}

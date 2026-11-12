import { Inject, Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { AVATAR_MESSAGES, type AvatarKind } from "@pt/contracts";
import { DataSource } from "typeorm";

import { badRequest } from "../auth/auth.errors.js";
import { payloadTooLargeError } from "../common/errors.js";
import { ChatConversation } from "../database/entities/chat-conversation.entity.js";
import {
  FILE_STORAGE,
  type FileRef,
  type FileStorage,
} from "./file-storage.js";
import { avatarUrl, decodeAvatarDataUrl } from "./image-rules.js";

const refOf = (kind: AvatarKind, id: number): FileRef => ({
  collection: kind === "admin" ? "avatar-admin" : "avatar-user",
  id,
});

// Profile photos (KAN-157). The id always comes from the session; the image
// goes through FileStorage.
@Injectable()
export class AvatarService {
  constructor(
    @Inject(FILE_STORAGE) private readonly storage: FileStorage,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  // Validates the data URL (size, shape, magic bytes), stores it and returns
  // the versioned URL.
  async set(kind: AvatarKind, id: number, dataUrl: string) {
    const decoded = decodeAvatarDataUrl(dataUrl);

    if (!decoded.ok) {
      throw decoded.reason === "too-large"
        ? payloadTooLargeError("AVATAR_TOO_LARGE", AVATAR_MESSAGES.TOO_LARGE)
        : badRequest("AVATAR_INVALID", AVATAR_MESSAGES.INVALID);
    }
    const version = await this.storage.put(refOf(kind, id), decoded);

    return avatarUrl(kind, id, version);
  }

  async clear(kind: AvatarKind, id: number) {
    await this.storage.remove(refOf(kind, id));
  }

  async urlOf(kind: AvatarKind, id: number) {
    return avatarUrl(kind, id, await this.storage.version(refOf(kind, id)));
  }

  fileOf(kind: AvatarKind, id: number) {
    return this.storage.get(refOf(kind, id));
  }

  // A trainee sees the PT team's photos once they have a conversation (the
  // shared inbox: every PT talks to them).
  hasConversation(userId: number) {
    return this.dataSource
      .getRepository(ChatConversation)
      .exists({ where: { userId } });
  }
}

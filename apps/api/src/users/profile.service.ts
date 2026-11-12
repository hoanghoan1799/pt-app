import { ForbiddenException, Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import {
  type AppLocale,
  type ChatColorKey,
  PROFILE_MESSAGES,
} from "@pt/contracts";
import { DataSource } from "typeorm";

import type { AuthActor } from "../auth/actor.js";
import { SessionInvalidError } from "../auth/auth.errors.js";
import { ChatProfileService } from "../chat/chat-profile.service.js";
import { notFoundError } from "../common/errors.js";
import { CURRENT_TERMS_VERSION } from "../contact-aliases/contact-aliases.service.js";
import { Admin } from "../database/entities/admin.entity.js";
import { User } from "../database/entities/user.entity.js";
import { toUserProfile } from "./trainee.mapper.js";

// A trainee's own profile and settings, and the settings both kinds of actor
// persist on their account (language, bio).
@Injectable()
export class ProfileService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly chatProfile: ChatProfileService,
  ) {}

  private get users() {
    return this.dataSource.getRepository(User);
  }

  async userProfile(userId: number) {
    const row = await this.users.findOne({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        locale: true,
        bio: true,
        chatColor: true,
        chatEnabled: true,
        ptAdminId: true,
        avatarUpdatedAt: true,
      },
    });

    if (!row) {
      throw notFoundError("USER_NOT_FOUND", PROFILE_MESSAGES.USER_NOT_FOUND);
    }
    return toUserProfile(row);
  }

  // Like sending a message, a colour change is refused while chat is locked.
  async setChatColor(userId: number, color: ChatColorKey | null) {
    const user = await this.users.findOne({
      where: { id: userId },
      select: { id: true, chatEnabled: true },
    });

    if (!user) {
      throw notFoundError("USER_NOT_FOUND", PROFILE_MESSAGES.USER_NOT_FOUND);
    }
    if (user.chatEnabled !== true) {
      throw new ForbiddenException({
        code: "CHAT_LOCKED",
        message: PROFILE_MESSAGES.CHAT_LOCKED,
      });
    }
    await this.users.update({ id: userId }, { chatColor: color });
    // Polling clients see the new colour through the conversation cursor.
    await this.chatProfile.accountColorChanged({ kind: "user", userId });
    return { color };
  }

  async setLocale(actor: AuthActor, locale: AppLocale) {
    if (actor.kind === "user") {
      await this.users.update({ id: actor.id }, { locale });
    } else {
      await this.dataSource
        .getRepository(Admin)
        .update({ id: actor.id }, { locale });
    }
    return { locale };
  }

  // A trainee must have accepted the current terms first; an empty bio clears.
  async setBio(actor: AuthActor, bio: string) {
    const value = bio === "" ? null : bio;

    if (actor.kind === "user") {
      const user = await this.users.findOne({
        where: { id: actor.id },
        select: { id: true, termsVersion: true },
      });

      if (!user) {
        throw new SessionInvalidError();
      }
      if ((user.termsVersion ?? 0) < CURRENT_TERMS_VERSION) {
        throw new ForbiddenException({
          code: "TERMS_REQUIRED",
          message: PROFILE_MESSAGES.TERMS_REQUIRED,
        });
      }
      await this.users.update({ id: actor.id }, { bio: value });
    } else {
      await this.dataSource
        .getRepository(Admin)
        .update({ id: actor.id }, { bio: value });
    }
    return { bio: value };
  }
}

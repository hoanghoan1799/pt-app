import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";

import { AdminHiddenUser } from "../database/entities/admin-hidden-user.entity.js";
import { ChatConversation } from "../database/entities/chat-conversation.entity.js";
import { User } from "../database/entities/user.entity.js";
import type { TraineeScopeFacts } from "./policies/pt-scope.policy.js";

export type TraineeFacts = TraineeScopeFacts & { userId: number };

// Facts the PtScopePolicy decides on, read for one admin and one trainee.
@Injectable()
export class TraineeScopeQueries {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async findByUserId(
    adminId: number,
    userId: number,
  ): Promise<TraineeFacts | null> {
    const user = await this.dataSource.getRepository(User).findOne({
      where: { id: userId },
      select: { id: true, ptAdminId: true },
    });

    if (!user) {
      return null;
    }
    const hidden = await this.dataSource
      .getRepository(AdminHiddenUser)
      .exists({ where: { adminId, userId } });

    return { userId: user.id, ptAdminId: user.ptAdminId, hidden };
  }

  // A conversation maps to its trainee.
  async findByConversationId(
    adminId: number,
    conversationId: number,
  ): Promise<TraineeFacts | null> {
    const conversation = await this.dataSource
      .getRepository(ChatConversation)
      .findOne({
        where: { id: conversationId },
        select: { id: true, userId: true },
      });

    return conversation
      ? this.findByUserId(adminId, conversation.userId)
      : null;
  }
}

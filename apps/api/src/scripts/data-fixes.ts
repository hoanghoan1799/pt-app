import { mapLegacyNickname } from "@pt/contracts";
import { type DataSource, IsNull } from "typeorm";

import { Admin } from "../database/entities/admin.entity.js";
import { ChatConversation } from "../database/entities/chat-conversation.entity.js";
import { ChatNickname } from "../database/entities/chat-nickname.entity.js";
import { ContactAlias } from "../database/entities/contact-alias.entity.js";

// One-time data fixes the web ran from its setup script. They are idempotent,
// so the cutover can run them on the migrated data and a re-run changes nothing.

// P1: admins that existed before roles (role null = super admin) get an
// explicit super_admin role and the blue tick, once. Setting the role marks the
// row as migrated, so a tick the super admin removes later is not granted
// again. PT accounts always have a role and are left alone. Returns how many
// rows changed.
export const verifyExistingSuperAdmins = async (
  dataSource: DataSource,
  now: Date = new Date(),
) => {
  const result = await dataSource
    .getRepository(Admin)
    .update({ role: IsNull() }, { role: "super_admin", verifiedAt: now });

  return result.affected ?? 0;
};

// Shared KAN-141 chat nicknames -> private aliases of whoever set them. Copies
// every chat_nicknames row that can be a private alias (see mapLegacyNickname)
// into contact_aliases (existing aliases win), then empties the legacy table,
// in one transaction: a leftover row would bring back an alias its owner has
// since cleared. Returns how many aliases were created.
export const moveChatNicknamesToAliases = (dataSource: DataSource) =>
  dataSource.transaction(async (em) => {
    const rows = await em
      .createQueryBuilder(ChatNickname, "n")
      .innerJoin(ChatConversation, "c", "c.id = n.conversationId")
      .select("n.targetKey", "targetKey")
      .addSelect("n.setByKey", "setByKey")
      .addSelect("n.nickname", "nickname")
      .addSelect("n.updatedAt", "updatedAt")
      .addSelect("c.userId", "conversationUserId")
      .getRawMany<{
        targetKey: string;
        setByKey: string;
        nickname: string;
        updatedAt: Date;
        conversationUserId: number;
      }>();
    const before = await em.count(ContactAlias);

    for (const row of rows) {
      const mapped = mapLegacyNickname(row);

      if (!mapped) {
        continue;
      }
      await em
        .createQueryBuilder()
        .insert()
        .into(ContactAlias)
        .values({ ...mapped, updatedAt: row.updatedAt })
        .orIgnore()
        .execute();
    }
    const after = await em.count(ContactAlias);

    await em.createQueryBuilder().delete().from(ChatNickname).execute();
    return after - before;
  });

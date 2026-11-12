import { eq, sql } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";

import type * as schema from "@/db/schema";
import { chatConversations, chatNicknames, contactAliases } from "@/db/schema";
import { mapLegacyNickname } from "@/features/contact-aliases/utils/alias-rules";

// Shared KAN-141 nicknames -> private aliases of whoever set them. Copies every
// chat_nicknames row that can be a private alias (see mapLegacyNickname) into
// contact_aliases (insert or ignore), then empties the legacy table, in one
// transaction. Emptying matters: the setup script runs on every build, and a
// leftover row would bring back an alias its owner has since cleared.
// Idempotent; returns how many aliases were created.
export const moveChatNicknamesToAliases = async (
  db: LibSQLDatabase<typeof schema>,
) =>
  db.transaction(async (tx) => {
    const rows = await tx
      .select({
        targetKey: chatNicknames.targetKey,
        setByKey: chatNicknames.setByKey,
        nickname: chatNicknames.nickname,
        updatedAt: chatNicknames.updatedAt,
        conversationUserId: chatConversations.userId,
      })
      .from(chatNicknames)
      .innerJoin(
        chatConversations,
        eq(chatConversations.id, chatNicknames.conversationId),
      );
    let created = 0;

    for (const row of rows) {
      const mapped = mapLegacyNickname(row);

      if (!mapped) {
        continue;
      }
      const inserted = await tx
        .insert(contactAliases)
        .values({ ...mapped, updatedAt: row.updatedAt })
        .onConflictDoNothing()
        .returning({ ownerKey: contactAliases.ownerKey });

      created += inserted.length;
    }
    await tx.run(sql`delete from ${chatNicknames}`);
    return created;
  });

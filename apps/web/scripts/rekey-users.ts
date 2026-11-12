// Recomputes users.name_key after a change to toNameKey.
// Run: pnpm exec tsx scripts/rekey-users.ts
import { toNameKey } from "@pt/contracts";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { users } from "@/db/schema";

const rekeyUsers = async () => {
  const rows = await db.select().from(users);

  for (const row of rows) {
    await db
      .update(users)
      .set({ nameKey: toNameKey(row.name) })
      .where(eq(users.id, row.id));
  }
  console.log(`Rekeyed ${rows.length} users`);
};

rekeyUsers();

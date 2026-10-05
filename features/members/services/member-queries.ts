import "server-only";

import { asc } from "drizzle-orm";

import { db } from "@/db";
import { users } from "@/db/schema";
import type { Member } from "@/features/members/types/member";

export const listMembers = async (): Promise<Member[]> =>
  db
    .select({ id: users.id, name: users.name })
    .from(users)
    .orderBy(asc(users.nameKey));

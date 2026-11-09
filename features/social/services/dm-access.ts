import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { dmConversations, users } from "@/db/schema";
import { loadPairState } from "@/features/social/services/relationships";
import { hasAcceptedTerms } from "@/features/social/services/terms";
import type { SocialActor } from "@/features/social/types/social";
import {
  type DmAccess,
  dmAccessOf,
  otherMember,
  sendBlockReason,
} from "@/features/social/utils/dm-rules";

// Who may open a trainee conversation and whether they may write in it. The
// one place the routes, pages and actions ask (spec Q6, A7): the two members,
// a super admin read-only, a PT never; a block hides it from the members.

export type DmConversation = typeof dmConversations.$inferSelect;

export interface DmView {
  conversation: DmConversation;
  access: Exclude<DmAccess, "none">;
  // Members only: the other trainee.
  otherId: number | null;
  // Null = the member may send; otherwise the reason it is read-only.
  readOnlyReason: string | null;
}

export const findDmConversation = async (id: number) => {
  const [row] = await db
    .select()
    .from(dmConversations)
    .where(eq(dmConversations.id, id))
    .limit(1);

  return row ?? null;
};

const loadTerms = async (ids: number[]) => {
  const result: boolean[] = [];

  for (const id of ids) {
    const [row] = await db
      .select({ termsVersion: users.termsVersion })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    result.push(row ? hasAcceptedTerms(row) : false);
  }
  return result;
};

// null = not found / not allowed (callers answer 404 either way).
export const resolveDmView = async (
  conversationId: number,
  viewer: SocialActor,
): Promise<DmView | null> => {
  const conversation = await findDmConversation(conversationId);

  if (!conversation) {
    return null;
  }
  const members = { low: conversation.userLow, high: conversation.userHigh };

  if (viewer.kind === "admin") {
    return dmAccessOf(viewer, members, false) === "readonly_admin"
      ? {
          conversation,
          access: "readonly_admin",
          otherId: null,
          readOnlyReason: null,
        }
      : null;
  }
  const pair = await loadPairState(members.low, members.high);

  if (dmAccessOf(viewer, members, pair.isBlocked) !== "member") {
    return null;
  }
  const otherId = otherMember(members, viewer.id);
  const [terms] = await loadTerms([viewer.id]);

  // Social pages sit behind the terms: without them nothing opens.
  if (!terms) {
    return null;
  }

  return {
    conversation,
    access: "member",
    otherId,
    readOnlyReason: sendBlockReason(),
  };
};

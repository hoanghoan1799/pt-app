import { Injectable } from "@nestjs/common";

import type { AdminActor, AuthActor } from "../auth/actor.js";
import { PtScopePolicy } from "../auth/policies/pt-scope.policy.js";

// What the policy needs to know about the trainee a conversation belongs to.
export type ConversationFacts = {
  traineeId: number;
  ptAdminId: number | null;
  // True when the calling admin hid the trainee (admin_hidden_users).
  hidden: boolean;
  // Chat is off by default: only an explicit `true` unlocks it.
  chatEnabled: boolean;
};

// Who may read and write which conversation, ported from chat-permission.ts,
// admin-scope.ts and hidden-users.ts. A plain class with no I/O so the matrix
// is unit-tested on its own.
//
//   trainee: only their own conversation; read-only while chat is locked (D5)
//   PT: only the conversations of trainees assigned to them (P1)
//   super admin: every conversation
//   hidden trainee: invisible to the admin who hid it, unless the session
//     revealed hidden trainees with the passcode (R2)
//   passcode-locked admin: nothing
@Injectable()
export class ChatPolicy {
  constructor(private readonly scope: PtScopePolicy) {}

  // May this admin be named in the trainee's conversation: a member of it,
  // that is a super admin or the trainee's own PT. Independent of who asks.
  isConversationAdmin(
    admin: Pick<AdminActor, "id" | "role">,
    facts: Pick<ConversationFacts, "ptAdminId">,
  ) {
    return this.scope.isInWorkspace(admin, {
      ptAdminId: facts.ptAdminId,
      hidden: false,
    });
  }

  canRead(actor: AuthActor, facts: ConversationFacts) {
    if (actor.kind === "user") {
      return actor.id === facts.traineeId;
    }
    return this.scope.canAccessTrainee(actor, facts);
  }

  // Sending, editing, unsending, reacting, photos, colours: the same access
  // plus chat switched on for the trainee (D6 for admins too).
  canWrite(actor: AuthActor, facts: ConversationFacts) {
    return this.canRead(actor, facts) && facts.chatEnabled;
  }
}

import type {
  groupAddResultSchema,
  groupCandidatesResponseSchema,
} from "@pt/contracts";
import type { z } from "zod";

// The shapes of the create and info screens, as the API sends them
// (company types/group.ts; the rest of it lives in @pt/contracts).

// What the add said about one id ("added", "out_of_scope", "cap_reached"...).
export type GroupAddResult = z.infer<typeof groupAddResultSchema>;

// The picker's people: trainees in the caller's scope and, for a super admin,
// PTs, minus the group's active members.
export type GroupCandidates = z.infer<typeof groupCandidatesResponseSchema>;
export type GroupCandidate = GroupCandidates["trainees"][number];

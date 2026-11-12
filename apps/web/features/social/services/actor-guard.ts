import "server-only";

import {
  actorOfAdmin,
  actorOfUser,
} from "@/features/social/services/post-context";
import { hasAcceptedTerms } from "@/features/social/services/terms";
import type { SocialActor } from "@/features/social/types/social";
import { requireAdmin, requireUser } from "@/services/auth-guard";

export type Who = "user" | "admin";

// A trainee who has not accepted the terms is turned away (null).
export const traineeActor = async (): Promise<SocialActor | null> => {
  const user = await requireUser();

  return hasAcceptedTerms(user) ? actorOfUser(user) : null;
};

export const adminActor = async (): Promise<SocialActor> =>
  actorOfAdmin(await requireAdmin());

export const resolveActor = (who: Who) =>
  who === "admin" ? adminActor() : traineeActor();

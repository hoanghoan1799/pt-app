import type {
  AdminAccount,
  AdminProfileResponse,
  TraineeDetail,
  TraineeSummary,
  UserProfileResponse,
} from "@pt/contracts";
import { resolveDisplayName, toAdminRole } from "@pt/contracts";

import type { Admin } from "../database/entities/admin.entity.js";
import type { User } from "../database/entities/user.entity.js";
import { avatarUrl } from "../files/image-rules.js";

// Entity -> response. Explicit field lists: password hashes, the stored image,
// the email key, terms and other internals have no field at all.

type SummaryRow = Pick<User, "id" | "name" | "ptAdminId" | "avatarUpdatedAt">;

// `alias` is the asking admin's private nickname for the trainee, if any.
export const toTraineeSummary = (
  row: SummaryRow,
  alias?: string,
): TraineeSummary => ({
  id: row.id,
  name: row.name,
  displayName: resolveDisplayName(alias, row.name),
  ptAdminId: row.ptAdminId,
  avatarUrl: avatarUrl("user", row.id, row.avatarUpdatedAt),
});

export const toTraineeDetail = (
  row: SummaryRow &
    Pick<User, "email" | "emailKey" | "chatEnabled" | "createdAt">,
  options: { alias?: string; hidden: boolean },
): TraineeDetail => ({
  ...toTraineeSummary(row, options.alias),
  email: row.email,
  hasLogin: row.emailKey !== null,
  chatEnabled: row.chatEnabled === true,
  hidden: options.hidden,
  createdAt: row.createdAt.toISOString(),
});

export const toUserProfile = (
  row: Pick<
    User,
    | "id"
    | "name"
    | "email"
    | "locale"
    | "bio"
    | "chatColor"
    | "chatEnabled"
    | "ptAdminId"
    | "avatarUpdatedAt"
  >,
): UserProfileResponse => ({
  id: row.id,
  name: row.name,
  email: row.email,
  locale: row.locale,
  bio: row.bio,
  chatColor: row.chatColor,
  chatEnabled: row.chatEnabled === true,
  avatarUrl: avatarUrl("user", row.id, row.avatarUpdatedAt),
  ptAdminId: row.ptAdminId,
});

export const toAdminProfile = (
  row: Pick<
    Admin,
    | "id"
    | "username"
    | "role"
    | "verifiedAt"
    | "locale"
    | "bio"
    | "chatColor"
    | "presenceHidden"
    | "avatarUpdatedAt"
  >,
): AdminProfileResponse => ({
  id: row.id,
  username: row.username,
  role: toAdminRole(row.role),
  verified: row.verifiedAt !== null,
  locale: row.locale,
  bio: row.bio,
  chatColor: row.chatColor,
  presenceHidden: row.presenceHidden ?? false,
  avatarUrl: avatarUrl("admin", row.id, row.avatarUpdatedAt),
});

export const toAdminAccount = (
  row: Pick<Admin, "id" | "username" | "role" | "verifiedAt">,
  traineeCount: number,
): AdminAccount => ({
  id: row.id,
  username: row.username,
  role: toAdminRole(row.role),
  verified: row.verifiedAt !== null,
  traineeCount,
});

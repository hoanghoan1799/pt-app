import { Baseline1794454359556 } from "./1794454359556-Baseline.js";
import { SocialPostIdempotency1794600000000 } from "./1794600000000-SocialPostIdempotency.js";
import { ChatPhotoClientId1794800000000 } from "./1794800000000-ChatPhotoClientId.js";
import { AvatarTables1795000000000 } from "./1795000000000-avatar-tables.js";

// Every migration, oldest first. Add new ones here; a test fails if a file in
// this folder is missing from the list.
export const migrations = [
  Baseline1794454359556,
  SocialPostIdempotency1794600000000,
  ChatPhotoClientId1794800000000,
  AvatarTables1795000000000,
];

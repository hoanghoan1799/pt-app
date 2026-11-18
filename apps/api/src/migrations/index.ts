import { Baseline1794454359556 } from "./1794454359556-Baseline.js";
import { SocialPostIdempotency1794600000000 } from "./1794600000000-SocialPostIdempotency.js";
import { ChatPhotoClientId1794800000000 } from "./1794800000000-ChatPhotoClientId.js";
import { DbIntegrity1794900000000 } from "./1794900000000-DbIntegrity.js";
import { AvatarTables1795000000000 } from "./1795000000000-AvatarTables.js";
import { DbConstraints1795100000000 } from "./1795100000000-DbConstraints.js";
import { DbChatSocial1795200000000 } from "./1795200000000-DbChatSocial.js";
import { DbHousekeeping1795300000000 } from "./1795300000000-DbHousekeeping.js";
import { ReportMessages1795600000000 } from "./1795600000000-ReportMessages.js";
import { UserRestrictions1795700000000 } from "./1795700000000-UserRestrictions.js";
import { AccentTheme1795800000000 } from "./1795800000000-AccentTheme.js";
import { ChatGroups1795900000000 } from "./1795900000000-ChatGroups.js";

// Every migration, oldest first. Add new ones here; a test fails if a file in
// this folder is missing from the list.
export const migrations = [
  Baseline1794454359556,
  SocialPostIdempotency1794600000000,
  ChatPhotoClientId1794800000000,
  DbIntegrity1794900000000,
  AvatarTables1795000000000,
  DbConstraints1795100000000,
  DbChatSocial1795200000000,
  DbHousekeeping1795300000000,
  ReportMessages1795600000000,
  UserRestrictions1795700000000,
  AccentTheme1795800000000,
  ChatGroups1795900000000,
];

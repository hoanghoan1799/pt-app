import type { RestrictionLevel } from "@pt/contracts";

// The read side of user_restrictions as plain SQL, so modules that must not
// depend on RestrictionsModule (auth, social, DM, contact aliases) share the
// one rule. `now` is a bound parameter holding Clock.now(), never SQL now():
// the whole API takes "now" from the Clock (tests move it).

// Spec D6: active while not lifted and with no end or an end in the future.
// The partial unique index user_restrictions_one_active keeps at most one row
// per trainee with lifted_at NULL, so "active" is that row when it has not run
// out.
export const activeRestrictionSql = (alias: string, now: string) =>
  `${alias}.lifted_at IS NULL AND (${alias}.until IS NULL OR ${alias}.until > ${now})`;

// True when the trainee whose id is `userIdSql` is suspended right now (D4).
export const suspendedUserSql = (userIdSql: string, now: string) =>
  `EXISTS (SELECT 1 FROM user_restrictions sr
    WHERE sr.user_id = ${userIdSql} AND sr.level = 'suspended'
      AND ${activeRestrictionSql("sr", now)})`;

export type ActiveRestriction = {
  id: number;
  userId: number;
  level: RestrictionLevel;
  // Null = permanent.
  until: Date | null;
  reason: string;
  createdAt: Date;
};

type Runner = { query: (sql: string, params?: unknown[]) => Promise<unknown> };

export type Row = {
  id: number;
  user_id: number;
  level: RestrictionLevel;
  until: Date | null;
  reason: string;
  created_at: Date;
};

export const toActive = (row: Row): ActiveRestriction => ({
  id: row.id,
  userId: row.user_id,
  level: row.level,
  until: row.until,
  reason: row.reason,
  createdAt: row.created_at,
});

// The active restriction of each trainee in `userIds` (at most one each).
export const loadActiveRestrictions = async (
  runner: Runner,
  userIds: number[],
  now: Date,
): Promise<Map<number, ActiveRestriction>> => {
  if (userIds.length === 0) {
    return new Map();
  }
  const rows = (await runner.query(
    `SELECT r.id, r.user_id, r.level, r.until, r.reason, r.created_at
       FROM user_restrictions r
      WHERE r.user_id = ANY($1::int[]) AND ${activeRestrictionSql("r", "$2")}
      ORDER BY r.created_at DESC, r.id DESC`,
    [userIds, now],
  )) as Row[];
  const result = new Map<number, ActiveRestriction>();

  for (const row of rows) {
    if (!result.has(row.user_id)) {
      result.set(row.user_id, toActive(row));
    }
  }
  return result;
};

export const loadActiveRestriction = async (
  runner: Runner,
  userId: number,
  now: Date,
): Promise<ActiveRestriction | null> =>
  (await loadActiveRestrictions(runner, [userId], now)).get(userId) ?? null;

// Spec D4: two trainees are "blocked" when either blocked the other
// (social_blocks) or either one is suspended right now. Every trainee-to-
// trainee visibility check (profiles, search, friends, DMs, aliases) uses it.
export const blockedOrSuspendedSql = (a: string, b: string, now: string) =>
  `(EXISTS (SELECT 1 FROM social_blocks sb
     WHERE (sb.blocker_id = ${a} AND sb.blocked_id = ${b})
        OR (sb.blocker_id = ${b} AND sb.blocked_id = ${a}))
    OR ${suspendedUserSql(a, now)} OR ${suspendedUserSql(b, now)})`;

export const isBlockedOrSuspendedBetween = async (
  runner: Runner,
  a: number,
  b: number,
  now: Date,
): Promise<boolean> => {
  const rows = (await runner.query(
    `SELECT ${blockedOrSuspendedSql("$1::int", "$2::int", "$3::timestamptz")} AS blocked`,
    [a, b, now],
  )) as { blocked: boolean }[];

  return rows[0]?.blocked === true;
};

// Trainees suspended right now, except `exceptId` (hidden from the others).
export const loadSuspendedUserIds = async (
  runner: Runner,
  now: Date,
  exceptId = 0,
): Promise<number[]> => {
  const rows = (await runner.query(
    `SELECT DISTINCT r.user_id FROM user_restrictions r
      WHERE r.level = 'suspended' AND ${activeRestrictionSql("r", "$1::timestamptz")}
        AND r.user_id <> $2::int`,
    [now, exceptId],
  )) as { user_id: number }[];

  return rows.map((row) => row.user_id);
};

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { WorkoutDay } from "../src/database/entities/workout-day.entity.js";
import { createTestDatabase, type TestDatabase } from "./support/database.js";

// PostgreSQL error codes: 23514 check_violation, 23503 foreign_key_violation,
// 23505 unique_violation.
const sqlState = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    return (error as { driverError?: { code?: string } }).driverError?.code;
  }
  return undefined;
};

describe("constraints", () => {
  let db: TestDatabase;
  const query = (sql: string, params: unknown[] = []) =>
    db.dataSource.query(sql, params);

  beforeAll(async () => {
    db = await createTestDatabase();
  });

  afterAll(async () => {
    await db.drop();
  });

  describe("enum CHECKs", () => {
    it("rejects an unknown admins.role and accepts the allowed ones", async () => {
      const insert = (key: string, role: string | null) =>
        query(
          `INSERT INTO admins (username, username_key, password_hash, role)
           VALUES ($1, $1, 'x', $2)`,
          [key, role],
        );

      expect(await sqlState(insert("boss", "boss"))).toBe("23514");
      await insert("root", "super_admin");
      await insert("coach", "pt");
      await insert("legacy", null);
    });

    it("rejects an unknown foods.group", async () => {
      const insert = (group: string) =>
        query(
          `INSERT INTO foods (name, name_key, "group", kcal, protein, carbs, fat)
           VALUES ('Pho', 'pho-' || $1::text, $1, 1, 1, 1, 1)`,
          [group],
        );

      expect(await sqlState(insert("candy"))).toBe("23514");
      await insert("dish");
    });

    it("rejects an unknown push_subscriptions.kind and defaults to web", async () => {
      const insert = (endpoint: string, kind: string | null) =>
        query(
          `INSERT INTO push_subscriptions (owner_key, endpoint, kind)
           VALUES ('user:1', $1, COALESCE($2, 'web'))`,
          [endpoint, kind],
        );

      expect(await sqlState(insert("e1", "sms"))).toBe("23514");
      await insert("e3", "expo");
      await query(
        `INSERT INTO push_subscriptions (owner_key, endpoint) VALUES ('user:1', 'e2')`,
      );

      const rows: { kind: string; p256dh: string | null }[] = await query(
        `SELECT kind, p256dh FROM push_subscriptions WHERE endpoint = 'e2'`,
      );

      expect(rows).toEqual([{ kind: "web", p256dh: null }]);
    });
  });

  describe("sessions", () => {
    it("requires exactly one subject that matches subject_kind", async () => {
      const [{ id: userId }] = await query(
        `INSERT INTO users (name, name_key) VALUES ('Sess', 'sess') RETURNING id`,
      );
      const [{ id: adminId }] = await query(
        `INSERT INTO admins (username, username_key, password_hash) VALUES ('s', 's', 'x') RETURNING id`,
      );
      const insert = (
        kind: string,
        user: number | null,
        admin: number | null,
        hash: string,
      ) =>
        query(
          `INSERT INTO sessions (token_hash, subject_kind, user_id, admin_id, expires_at, client_kind)
           VALUES (decode($1, 'hex'), $2, $3, $4, now() + interval '1 day', 'web')`,
          [hash, kind, user, admin],
        );

      expect(await sqlState(insert("user", userId, adminId, "aa"))).toBe(
        "23514",
      );
      expect(await sqlState(insert("user", null, null, "bb"))).toBe("23514");
      expect(await sqlState(insert("admin", userId, null, "cc"))).toBe("23514");
      await insert("user", userId, null, "dd");
      await insert("admin", null, adminId, "ee");
      expect(await sqlState(insert("user", userId, null, "dd"))).toBe("23505");
    });
  });

  describe("foreign keys", () => {
    it("rejects a user that points to a missing admin", async () => {
      expect(
        await sqlState(
          query(
            `INSERT INTO users (name, name_key, pt_admin_id) VALUES ('Orphan', 'orphan', 999999)`,
          ),
        ),
      ).toBe("23503");
    });

    it("cascades a user delete through workouts, chat and sessions", async () => {
      const [{ id: userId }] = await query(
        `INSERT INTO users (name, name_key) VALUES ('Gone', 'gone') RETURNING id`,
      );
      const [{ id: dayId }] = await query(
        `INSERT INTO workout_days (user_id, date) VALUES ($1, '2026-11-12') RETURNING id`,
        [userId],
      );
      const [{ id: exerciseId }] = await query(
        `INSERT INTO exercises (day_id, title, youtube_id) VALUES ($1, 'Squat', 'abc') RETURNING id`,
        [dayId],
      );
      await query(
        `INSERT INTO exercise_sets (exercise_id, user_id, position, reps) VALUES ($1, $2, 1, 10)`,
        [exerciseId, userId],
      );
      const [{ id: conversationId }] = await query(
        `INSERT INTO chat_conversations (user_id) VALUES ($1) RETURNING id`,
        [userId],
      );
      await query(
        `INSERT INTO chat_messages (conversation_id, sender_role, client_id, created_at)
         VALUES ($1, 'user', 'c1', now())`,
        [conversationId],
      );
      await query(
        `INSERT INTO sessions (token_hash, subject_kind, user_id, expires_at, client_kind)
         VALUES (decode('ff01', 'hex'), 'user', $1, now() + interval '1 day', 'web')`,
        [userId],
      );

      await query(`DELETE FROM users WHERE id = $1`, [userId]);

      for (const table of [
        "workout_days",
        "exercises",
        "exercise_sets",
        "chat_conversations",
        "chat_messages",
      ]) {
        const [{ count }] = await query(
          `SELECT count(*)::int AS count FROM ${table}`,
        );

        expect(count, table).toBe(0);
      }

      const [{ count }] = await query(
        `SELECT count(*)::int AS count FROM sessions WHERE token_hash = decode('ff01', 'hex')`,
      );

      expect(count).toBe(0);
    });

    it("keeps the user but clears pt_admin_id when the admin is deleted", async () => {
      const [{ id: adminId }] = await query(
        `INSERT INTO admins (username, username_key, password_hash) VALUES ('pt1', 'pt1', 'x') RETURNING id`,
      );
      const [{ id: userId }] = await query(
        `INSERT INTO users (name, name_key, pt_admin_id) VALUES ('Kept', 'kept', $1) RETURNING id`,
        [adminId],
      );

      await query(`DELETE FROM admins WHERE id = $1`, [adminId]);

      const rows = await query(`SELECT pt_admin_id FROM users WHERE id = $1`, [
        userId,
      ]);

      expect(rows).toEqual([{ pt_admin_id: null }]);
    });

    it("refuses to delete a food that a meal plan uses (RESTRICT)", async () => {
      const [{ id: userId }] = await query(
        `INSERT INTO users (name, name_key) VALUES ('Eater', 'eater') RETURNING id`,
      );
      const [{ id: foodId }] = await query(
        `INSERT INTO foods (name, name_key, "group", kcal, protein, carbs, fat)
         VALUES ('Rice', 'rice', 'starch', 130, 2, 28, 0.3) RETURNING id`,
      );
      const [{ id: dayId }] = await query(
        `INSERT INTO meal_plan_days (user_id, date) VALUES ($1, '2026-11-12') RETURNING id`,
        [userId],
      );
      const [{ id: mealId }] = await query(
        `INSERT INTO meal_plan_meals (day_id, position, name) VALUES ($1, 1, 'Lunch') RETURNING id`,
        [dayId],
      );
      await query(
        `INSERT INTO meal_plan_items (meal_id, food_id, grams) VALUES ($1, $2, 150)`,
        [mealId, foodId],
      );

      expect(
        await sqlState(query(`DELETE FROM foods WHERE id = $1`, [foodId])),
      ).toBe("23503");
    });
  });

  describe("calendar days", () => {
    const DATE_COLUMNS = [
      ["workout_days", "date"],
      ["meal_plan_days", "date"],
      ["weight_logs", "date"],
      ["food_entries", "date"],
      ["nutrition_targets", "effective_from"],
    ];

    it("stores every day column as a date", async () => {
      const rows: { table_name: string; column_name: string; data_type: string }[] =
        await query(
          `SELECT table_name, column_name, data_type FROM information_schema.columns
            WHERE table_schema = 'public' AND (table_name, column_name) IN
              (${DATE_COLUMNS.map(([t, c]) => `('${t}', '${c}')`).join(", ")})`,
        );

      expect(rows).toHaveLength(DATE_COLUMNS.length);
      expect(rows.every((row) => row.data_type === "date")).toBe(true);
    });

    it("rejects text that is not a real day", async () => {
      const [{ id: userId }] = await query(
        `INSERT INTO users (name, name_key) VALUES ('Days', 'days') RETURNING id`,
      );
      const insert = (date: string) =>
        query(`INSERT INTO workout_days (user_id, date) VALUES ($1, $2)`, [
          userId,
          date,
        ]);

      expect(await sqlState(insert("2026-02-30"))).toBe("22008");
      expect(await sqlState(insert("not-a-day"))).toBe("22007");
    });

    // The driver would turn a date into a Date at local midnight; a server in
    // Ho Chi Minh (UTC+7) or Kiritimati (UTC+14) would then shift the day.
    it.each(["Asia/Ho_Chi_Minh", "Pacific/Kiritimati", "America/Los_Angeles"])(
      "reads a day back as the same YYYY-MM-DD text in %s",
      async (zone) => {
        const before = process.env.TZ;
        const [{ id: userId }] = await query(
          `INSERT INTO users (name, name_key) VALUES ($1, $1) RETURNING id`,
          [`tz-${zone}`],
        );

        process.env.TZ = zone;
        try {
          await query(
            `INSERT INTO workout_days (user_id, date) VALUES ($1, '2026-03-01'), ($1, '2026-01-01'), ($1, '2026-12-31')`,
            [userId],
          );

          const rows: { date: unknown }[] = await query(
            `SELECT date FROM workout_days WHERE user_id = $1 ORDER BY date`,
            [userId],
          );
          const viaOrm = await db.dataSource
            .getRepository(WorkoutDay)
            .find({ where: { userId }, order: { date: "ASC" } });
          const viaOrmDate = await db.dataSource
            .getRepository(WorkoutDay)
            .findOneByOrFail({ userId, date: "2026-03-01" });

          expect(rows.map((row) => row.date)).toEqual([
            "2026-01-01",
            "2026-03-01",
            "2026-12-31",
          ]);
          expect(viaOrm.map((day) => day.date)).toEqual([
            "2026-01-01",
            "2026-03-01",
            "2026-12-31",
          ]);
          expect(viaOrmDate.date).toBe("2026-03-01");
        } finally {
          if (before === undefined) {
            delete process.env.TZ;
          } else {
            process.env.TZ = before;
          }
        }
      },
    );

    it("orders and filters ranges as days, not as text", async () => {
      const [{ id: userId }] = await query(
        `INSERT INTO users (name, name_key) VALUES ('Range', 'range') RETURNING id`,
      );

      await query(
        `INSERT INTO weight_logs (user_id, date, weight_kg)
         VALUES ($1, '2026-02-28', 70), ($1, '2026-03-01', 71), ($1, '2026-03-02', 72)`,
        [userId],
      );

      const rows: { date: string }[] = await query(
        `SELECT date FROM weight_logs WHERE user_id = $1 AND date BETWEEN $2 AND $3 ORDER BY date`,
        [userId, "2026-03-01", "2026-03-02"],
      );

      expect(rows.map((row) => row.date)).toEqual(["2026-03-01", "2026-03-02"]);
    });
  });
});

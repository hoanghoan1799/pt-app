import { afterAll, beforeAll, describe, expect, it } from "vitest";

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
});

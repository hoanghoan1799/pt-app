// Adds a "Demo" trainee with this week's schedule, a few completions, a body
// profile, weigh-ins, a nutrition target and food entries, for trying the app
// locally. Re-running replaces the demo trainee's data. LOCAL DATABASES ONLY: it
// refuses NODE_ENV=production and any DATABASE_URL whose host is not localhost.
//
//   pnpm demo:seed              create / refresh (sign in as demo@example.test)
//   pnpm demo:seed --remove
import "reflect-metadata";

import { addDays, getTodayDate, getWeekStart, toNameKey } from "@pt/contracts";
import { DataSource } from "typeorm";

import { hashPassword } from "../auth/password-hash.js";
import { buildDataSourceOptions } from "../database/data-source-options.js";
import { assertLocalDatabase } from "./demo-guard.js";

const DEMO_NAME = "Demo";
const DEMO_EMAIL = "demo@example.test";
// Throwaway password of a local demo account.
const DEMO_PASSWORD = "demo-password-123";
const HOUR_MS = 60 * 60 * 1000;

const DEMO_DAYS = [
  {
    offset: 0,
    title: "Push – Ngực, vai, tay sau",
    exercises: [
      {
        title: "Bench press",
        youtubeId: "rT7DgCr-3pg",
        sets: 4,
        reps: "8-10",
        isDone: true,
      },
      {
        title: "Overhead press",
        youtubeId: "qEwKCR5JCog",
        sets: 3,
        reps: "10-12",
        isDone: true,
      },
      {
        title: "Triceps pushdown",
        youtubeId: "2-LAMcpzODU",
        sets: 3,
        reps: "12-15",
        isDone: true,
      },
    ],
  },
  {
    offset: 2,
    title: "Pull – Lưng, tay trước",
    exercises: [
      {
        title: "Lat pulldown",
        youtubeId: "CAwf7n6Luuc",
        sets: 4,
        reps: "10-12",
        isDone: true,
      },
      {
        title: "Barbell row",
        youtubeId: "kBWAon7ItDw",
        sets: 4,
        reps: "8-10",
        isDone: false,
      },
    ],
  },
  {
    offset: 4,
    title: "Legs – Chân, mông",
    exercises: [
      {
        title: "Squat",
        youtubeId: "ultWZbUMPL8",
        sets: 4,
        reps: "8-10",
        isDone: false,
      },
      {
        title: "Plank",
        youtubeId: "pSHjTRCQxIw",
        sets: 3,
        reps: "45 giây",
        isDone: false,
      },
    ],
  },
];

const DEMO_MEALS = [
  {
    offset: 0,
    meal: "breakfast",
    description: "Phở bò",
    carbs: 80,
    protein: 30,
    fat: 12,
  },
  {
    offset: 0,
    meal: "lunch",
    description: "Cơm, ức gà luộc, rau",
    carbs: 120,
    protein: 70,
    fat: 15,
  },
  {
    offset: 0,
    meal: "dinner",
    description: "Khoai lang, cá hồi áp chảo",
    carbs: 60,
    protein: 45,
    fat: 28,
  },
] as const;

const removeDemoUser = async (dataSource: DataSource) => {
  // Everything else cascades from the user.
  await dataSource.query("DELETE FROM users WHERE name_key = $1", [
    toNameKey(DEMO_NAME),
  ]);
};

const seedDemo = async (dataSource: DataSource) => {
  await removeDemoUser(dataSource);

  if (process.argv.includes("--remove")) {
    console.log(`Removed trainee "${DEMO_NAME}".`);
    return;
  }

  const today = getTodayDate();
  const weekStart = getWeekStart(today);
  const [demo] = (await dataSource.query(
    `INSERT INTO users (name, name_key, email, email_key, password_hash)
     VALUES ($1, $2, $3, $3, $4) RETURNING id`,
    [
      DEMO_NAME,
      toNameKey(DEMO_NAME),
      DEMO_EMAIL,
      await hashPassword(DEMO_PASSWORD),
    ],
  )) as { id: number }[];
  let completedCount = 0;

  for (const day of DEMO_DAYS) {
    const date = addDays(weekStart, day.offset);
    const [created] = (await dataSource.query(
      "INSERT INTO workout_days (user_id, date, title) VALUES ($1, $2, $3) RETURNING id",
      [demo.id, date, day.title],
    )) as { id: number }[];

    for (const [position, item] of day.exercises.entries()) {
      const [exercise] = (await dataSource.query(
        `INSERT INTO exercises (day_id, position, title, youtube_id, sets, reps)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [
          created.id,
          position,
          item.title,
          item.youtubeId,
          item.sets,
          item.reps,
        ],
      )) as { id: number }[];

      // Completions only for days that already happened.
      if (item.isDone && date <= today) {
        completedCount += 1;
        await dataSource.query(
          "INSERT INTO exercise_completions (exercise_id, user_id, completed_at) VALUES ($1, $2, $3)",
          [
            exercise.id,
            demo.id,
            new Date(Date.now() - completedCount * HOUR_MS),
          ],
        );
      }
    }
  }

  await dataSource.query(
    `INSERT INTO body_profiles
       (user_id, sex, birth_year, height_cm, weight_kg, activity_level, goal)
     VALUES ($1, 'male', $2, 175, 75, 'moderate', 'cut')`,
    [demo.id, Number(today.slice(0, 4)) - 30],
  );

  // ~0,4 kg/week down over 12 weeks, 2-3 weigh-ins a week, weeks 4 and 9 skipped.
  const weighIns = Array.from({ length: 12 }, (_, week) => week)
    .filter((week) => week !== 3 && week !== 8)
    .flatMap((week) =>
      [0, 3, 6].slice(0, week % 2 ? 2 : 3).map((dayOffset) => ({
        date: addDays(weekStart, (week - 11) * 7 + dayOffset),
        weightKg:
          Math.round((79 - week * 0.4 + (dayOffset - 3) * 0.05) * 10) / 10,
      })),
    )
    .filter((log) => log.date <= today);

  for (const log of weighIns) {
    await dataSource.query(
      "INSERT INTO weight_logs (user_id, date, weight_kg) VALUES ($1, $2, $3)",
      [demo.id, log.date, log.weightKg],
    );
  }

  await dataSource.query(
    `INSERT INTO nutrition_targets (user_id, effective_from, carbs, protein, fat, note)
     VALUES ($1, $2, 250, 150, 60, $3)`,
    [
      demo.id,
      weekStart,
      "Ưu tiên đạm nạc, nhiều rau. Uống 2,5 lít nước mỗi ngày.",
    ],
  );

  for (const item of DEMO_MEALS) {
    const date = addDays(weekStart, item.offset);

    if (date <= today) {
      await dataSource.query(
        `INSERT INTO food_entries (user_id, date, meal, description, carbs, protein, fat)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          demo.id,
          date,
          item.meal,
          item.description,
          item.carbs,
          item.protein,
          item.fat,
        ],
      );
    }
  }

  console.log(
    `Created trainee "${DEMO_NAME}" (${DEMO_EMAIL}) with the week of ${weekStart} (${completedCount} exercises done).`,
  );
};

const run = async () => {
  const { DATABASE_URL, NODE_ENV } = process.env;

  assertLocalDatabase(DATABASE_URL, NODE_ENV);

  const dataSource = new DataSource(
    buildDataSourceOptions(DATABASE_URL as string),
  );

  await dataSource.initialize();
  try {
    await seedDemo(dataSource);
  } finally {
    await dataSource.destroy();
  }
};

run().catch((error: unknown) => {
  console.error(
    error instanceof Error && error.message.startsWith("demo:seed")
      ? error.message
      : error instanceof Error && error.message.startsWith("Missing")
        ? error.message
        : "Seeding the demo trainee failed (database error).",
  );
  process.exit(1);
});

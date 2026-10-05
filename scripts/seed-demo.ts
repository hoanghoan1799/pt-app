// Adds a "Demo" user with this week's schedule and a few completions, for
// trying the app locally. Re-running replaces the demo user's data.
//   npm run db:seed-demo           create / refresh
//   npm run db:seed-demo -- --remove
import { eq, inArray } from "drizzle-orm";

import { TIME_ZONE } from "@/constants/time";
import { db } from "@/db";
import {
  bodyProfiles,
  exerciseCompletions,
  exercises,
  foodEntries,
  nutritionTargets,
  users,
  workoutDays,
} from "@/db/schema";
import { toNameKey } from "@/utils/name";
import { addDays, getTodayDate, getWeekStart } from "@/utils/week";

const DEMO_NAME = "Demo";
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
    entry: {
      meal: "breakfast",
      description: "Phở bò",
      carbs: 80,
      protein: 30,
      fat: 12,
    },
  },
  {
    offset: 0,
    entry: {
      meal: "lunch",
      description: "Cơm, ức gà luộc, rau",
      carbs: 120,
      protein: 70,
      fat: 15,
    },
  },
  {
    offset: 0,
    entry: {
      meal: "dinner",
      description: "Khoai lang, cá hồi áp chảo",
      carbs: 60,
      protein: 45,
      fat: 28,
    },
  },
] as const;

const removeDemoUser = async () => {
  const [demo] = await db
    .select()
    .from(users)
    .where(eq(users.nameKey, toNameKey(DEMO_NAME)));

  if (!demo) {
    return;
  }

  const days = await db
    .select({ id: workoutDays.id })
    .from(workoutDays)
    .where(eq(workoutDays.userId, demo.id));
  const dayIds = days.map((day) => day.id);

  await db
    .delete(exerciseCompletions)
    .where(eq(exerciseCompletions.userId, demo.id));
  await db.delete(foodEntries).where(eq(foodEntries.userId, demo.id));
  await db.delete(nutritionTargets).where(eq(nutritionTargets.userId, demo.id));
  await db.delete(bodyProfiles).where(eq(bodyProfiles.userId, demo.id));
  if (dayIds.length) {
    await db.delete(exercises).where(inArray(exercises.dayId, dayIds));
    await db.delete(workoutDays).where(inArray(workoutDays.id, dayIds));
  }
  await db.delete(users).where(eq(users.id, demo.id));
};

const seedDemo = async () => {
  await removeDemoUser();

  if (process.argv.includes("--remove")) {
    console.log(`✔ Đã xóa user "${DEMO_NAME}"`);
    return;
  }

  const today = getTodayDate(TIME_ZONE);
  const weekStart = getWeekStart(today);
  const [demo] = await db
    .insert(users)
    .values({ name: DEMO_NAME, nameKey: toNameKey(DEMO_NAME) })
    .returning();
  let completedCount = 0;

  for (const day of DEMO_DAYS) {
    const date = addDays(weekStart, day.offset);
    const [created] = await db
      .insert(workoutDays)
      .values({ userId: demo.id, date, title: day.title })
      .returning();

    for (const [position, item] of day.exercises.entries()) {
      const [exercise] = await db
        .insert(exercises)
        .values({
          dayId: created.id,
          position,
          title: item.title,
          youtubeId: item.youtubeId,
          sets: item.sets,
          reps: item.reps,
        })
        .returning();

      // Completions only for days that already happened.
      if (item.isDone && date <= today) {
        completedCount += 1;
        await db.insert(exerciseCompletions).values({
          exerciseId: exercise.id,
          userId: demo.id,
          completedAt: new Date(Date.now() - completedCount * HOUR_MS),
        });
      }
    }
  }
  await db.insert(bodyProfiles).values({
    userId: demo.id,
    sex: "male",
    birthYear: Number(today.slice(0, 4)) - 30,
    heightCm: 175,
    weightKg: 75,
    activityLevel: "moderate",
    goal: "cut",
  });
  await db.insert(nutritionTargets).values({
    userId: demo.id,
    effectiveFrom: weekStart,
    carbs: 250,
    protein: 150,
    fat: 60,
    note: "Ưu tiên đạm nạc, nhiều rau. Uống 2,5 lít nước mỗi ngày.",
  });
  await db.insert(foodEntries).values(
    DEMO_MEALS.filter((item) => addDays(weekStart, item.offset) <= today).map(
      (item) => ({
        ...item.entry,
        userId: demo.id,
        date: addDays(weekStart, item.offset),
      }),
    ),
  );

  console.log(
    `✔ Đã tạo user "${DEMO_NAME}" với lịch tuần ${weekStart} (${completedCount} bài đã tập)`,
  );
};

seedDemo();

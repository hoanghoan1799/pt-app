import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { createClient } from "@libsql/client";
import {
  type Browser,
  expect,
  type Locator,
  type Page,
  test,
} from "@playwright/test";
import { drizzle } from "drizzle-orm/libsql";

import * as schema from "@/db/schema";
import { hashPassword } from "@/services/password";
import { toEmailKey } from "@/utils/email";
import { toNameKey } from "@/utils/name";

import { fillTraineeLogin } from "./auth";
import {
  E2E_ADMIN,
  E2E_BASE_URL,
  E2E_DB_URL,
  E2E_TMP_DIR,
  E2E_USER_PASSWORD,
  e2eEmail,
} from "./config";

// Week calendar card (KAN-153) on the trainee workouts and nutrition tabs and
// the admin member week. KAN-152 already asserts the legend and data-future in
// the feature specs; this spec covers the title, the "Hôm nay" shortcut, the
// day cells (future, selected, workout status dot) and the 320 px layout.
//
// Dates are computed here from Intl and plain UTC maths, never with the app's
// own week helpers, so a bug in them cannot hide behind the same bug here.
const TIME_ZONE = "Asia/Ho_Chi_Minh";
const CALENDAR_NAME = "E2E Calendar";

const getToday = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

const shift = (date: string, days: number) => {
  const [year, month, day] = date.split("-").map(Number);

  return new Date(Date.UTC(year, month - 1, day + days))
    .toISOString()
    .slice(0, 10);
};

const mondayOf = (date: string) => {
  const [year, month, day] = date.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();

  return shift(date, -((weekday + 6) % 7));
};

const weekOf = (weekStart: string) =>
  Array.from({ length: 7 }, (_, index) => shift(weekStart, index));

// "Tuần 2–8/11, 2026"; a week over two months or two years names both ends.
const expectedTitle = (weekStart: string) => {
  const end = shift(weekStart, 6);
  const [startYear, startMonth, startDay] = weekStart.split("-").map(Number);
  const [endYear, endMonth, endDay] = end.split("-").map(Number);

  if (startYear !== endYear) {
    return `Tuần ${startDay}/${startMonth}/${startYear}–${endDay}/${endMonth}/${endYear}`;
  }
  if (startMonth !== endMonth) {
    return `Tuần ${startDay}/${startMonth}–${endDay}/${endMonth}, ${endYear}`;
  }
  return `Tuần ${startDay}–${endDay}/${endMonth}, ${endYear}`;
};

// A fresh trainee owns the status data, so no other spec can change it.
// Last week: day 1 has every exercise logged, day 2 one of two, day 3 none.
const TODAY = getToday();
const THIS_WEEK = mondayOf(TODAY);
const LAST_WEEK = shift(THIS_WEEK, -7);
const NEXT_WEEK = shift(THIS_WEEK, 7);

let calendarUserId = 0;

const withDb = async <T>(
  run: (db: ReturnType<typeof drizzle<typeof schema>>) => Promise<T>,
) => {
  const client = createClient({ url: E2E_DB_URL });

  try {
    return await run(drizzle(client, { schema }));
  } finally {
    client.close();
  }
};

const removeCalendarUser = (client: ReturnType<typeof createClient>) =>
  client.batch([
    {
      sql: `DELETE FROM exercise_completions WHERE user_id IN (SELECT id FROM users WHERE name = ?)`,
      args: [CALENDAR_NAME],
    },
    {
      sql: `DELETE FROM exercises WHERE day_id IN (SELECT d.id FROM workout_days d JOIN users u ON u.id = d.user_id WHERE u.name = ?)`,
      args: [CALENDAR_NAME],
    },
    {
      sql: `DELETE FROM workout_days WHERE user_id IN (SELECT id FROM users WHERE name = ?)`,
      args: [CALENDAR_NAME],
    },
    { sql: `DELETE FROM users WHERE name = ?`, args: [CALENDAR_NAME] },
  ]);

test.beforeAll(async () => {
  const client = createClient({ url: E2E_DB_URL });

  try {
    await removeCalendarUser(client);
  } finally {
    client.close();
  }
  const passwordHash = await hashPassword(E2E_USER_PASSWORD);

  await withDb(async (db) => {
    const [user] = await db
      .insert(schema.users)
      .values({
        name: CALENDAR_NAME,
        nameKey: toNameKey(CALENDAR_NAME),
        email: e2eEmail(CALENDAR_NAME),
        emailKey: toEmailKey(e2eEmail(CALENDAR_NAME)),
        passwordHash,
      })
      .returning();

    calendarUserId = user.id;
    const plan = [
      { date: LAST_WEEK, logged: 2 },
      { date: shift(LAST_WEEK, 1), logged: 1 },
      { date: shift(LAST_WEEK, 2), logged: 0 },
    ];

    for (const { date, logged } of plan) {
      const [day] = await db
        .insert(schema.workoutDays)
        .values({ userId: user.id, date, title: "E2E" })
        .returning();
      const rows = await db
        .insert(schema.exercises)
        .values(
          ["A", "B"].map((key, position) => ({
            dayId: day.id,
            title: `E2E Calendar ${key}`,
            sets: 3,
            reps: "10",
            position,
            youtubeId: "e2ecalendar",
          })),
        )
        .returning();

      if (logged > 0) {
        await db.insert(schema.exerciseCompletions).values(
          rows.slice(0, logged).map((row) => ({
            exerciseId: row.id,
            userId: user.id,
            completedAt: new Date(),
          })),
        );
      }
    }
  });
});

test.beforeAll(async ({ browser }) => {
  await saveSession(browser, "trainee", logInAsCalendarTrainee);
  await saveSession(browser, "admin", logInAsAdmin);
});

test.afterAll(async () => {
  const client = createClient({ url: E2E_DB_URL });

  try {
    await removeCalendarUser(client);
  } finally {
    client.close();
  }
});

interface Surface {
  name: string;
  hasStatus: boolean;
  path: () => string;
  role: "trainee" | "admin";
}

const STATE_FILES = {
  trainee: resolve(E2E_TMP_DIR, "week-calendar-trainee.json"),
  admin: resolve(E2E_TMP_DIR, "week-calendar-admin.json"),
};

const saveSession = async (
  browser: Browser,
  role: keyof typeof STATE_FILES,
  logIn: (page: Page) => Promise<void>,
) => {
  const context = await browser.newContext({ baseURL: E2E_BASE_URL });
  const page = await context.newPage();

  await logIn(page);
  mkdirSync(dirname(STATE_FILES[role]), { recursive: true });
  await context.storageState({ path: STATE_FILES[role] });
  await context.close();
};

const logInAsCalendarTrainee = async (page: Page) => {
  await page.goto("/");
  await fillTraineeLogin(page, CALENDAR_NAME);
  await expect(page).toHaveURL(/\/workouts/);
};

const logInAsAdmin = async (page: Page) => {
  await page.goto("/admin/login");
  await page.getByLabel("Tài khoản").fill(E2E_ADMIN.username);
  await page.getByLabel("Mật khẩu").fill(E2E_ADMIN.password);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page).toHaveURL(/\/admin(\?.*)?$/);
};

const SURFACES: Surface[] = [
  {
    name: "trainee workouts",
    hasStatus: true,
    path: () => "/workouts",
    role: "trainee",
  },
  {
    name: "trainee nutrition",
    hasStatus: false,
    path: () => "/nutrition",
    role: "trainee",
  },
  {
    name: "admin member week",
    hasStatus: true,
    path: () => `/admin/users/${calendarUserId}`,
    role: "admin",
  },
];

const getCard = (page: Page) => page.getByRole("region", { name: "Lịch tuần" });
const getTitle = (page: Page) => getCard(page).locator("nav > p");
const getCells = (page: Page) =>
  getCard(page).locator('a:has([data-testid="day-status"])');
const getCell = (page: Page, date: string) =>
  getCells(page).and(page.locator(`[href*="day=${date}"]`));
const getTodayControl = (page: Page) =>
  getCard(page).getByText("Hôm nay", { exact: true });

const clickControl = async (page: Page, label: string, weekStart: string) => {
  await getCard(page).getByRole("link", { name: label }).click();
  await expect(getTitle(page)).toHaveText(expectedTitle(weekStart));
};

const getHorizontalOverflow = (page: Page) =>
  page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );

test.describe("week calendar card", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    // Thumbnails come from YouTube; the suite must not depend on the network.
    await page.route(/(ytimg|youtube)\.com/, (route) => route.abort());
    const surface = SURFACES.find((item) =>
      testInfo.title.startsWith(item.name),
    );

    if (!surface) {
      throw new Error(`no surface for test "${testInfo.title}"`);
    }
    // Sessions are cookies; logging in once per role keeps the spec fast.
    const state = JSON.parse(readFileSync(STATE_FILES[surface.role], "utf8"));

    await page.context().addCookies(state.cookies);
    await page.goto(surface.path());
    await expect(getCard(page)).toBeVisible();
  });

  for (const surface of SURFACES) {
    test(`${surface.name}: the title shows the current week and follows ‹ and ›`, async ({
      page,
    }) => {
      await expect(getTitle(page)).toHaveText(expectedTitle(THIS_WEEK));

      await clickControl(page, "Tuần trước", LAST_WEEK);
      await expect(page).toHaveURL(new RegExp(`week=${LAST_WEEK}`));

      await clickControl(page, "Tuần sau", THIS_WEEK);
      await clickControl(page, "Tuần sau", NEXT_WEEK);
      await expect(page).toHaveURL(new RegExp(`week=${NEXT_WEEK}`));

      await clickControl(page, "Tuần sau", shift(NEXT_WEEK, 7));
      await clickControl(page, "Tuần trước", NEXT_WEEK);
    });

    test(`${surface.name}: Hôm nay is muted on today and brings you back from another week`, async ({
      page,
    }) => {
      // Today selected: a muted label, not a link.
      await expect(getTodayControl(page)).toHaveAttribute(
        "aria-disabled",
        "true",
      );
      await expect(
        getCard(page).getByRole("link", { name: "Hôm nay" }),
      ).toHaveCount(0);
      await expect(getCell(page, TODAY)).toHaveAttribute(
        "aria-current",
        "date",
      );

      await clickControl(page, "Tuần trước", LAST_WEEK);
      await expect(getCell(page, shift(TODAY, -7))).toHaveAttribute(
        "aria-current",
        "date",
      );

      // Another week: active, and one tap returns to this week with today.
      const todayLink = getCard(page).getByRole("link", { name: "Hôm nay" });

      await expect(todayLink).toBeVisible();
      await expect(todayLink).not.toHaveAttribute("aria-disabled");
      await todayLink.click();

      await expect(getTitle(page)).toHaveText(expectedTitle(THIS_WEEK));
      await expect(page).toHaveURL(new RegExp(`day=${TODAY}`));
      await expect(
        getCells(page).and(page.locator('[aria-current="date"]')),
      ).toHaveCount(1);
      await expect(getCell(page, TODAY)).toHaveAttribute(
        "aria-current",
        "date",
      );
      await expect(getTodayControl(page)).toHaveAttribute(
        "aria-disabled",
        "true",
      );
    });

    test(`${surface.name}: only days after today are future and the selected day is marked`, async ({
      page,
    }) => {
      const expectDays = async (weekStart: string, selected: string) => {
        await expect(getCells(page)).toHaveCount(7);

        for (const date of weekOf(weekStart)) {
          const cell = getCell(page, date);

          if (date > TODAY) {
            await expect(cell).toHaveAttribute("data-future", "true");
          } else {
            await expect(cell).not.toHaveAttribute("data-future");
          }
          if (date === selected) {
            await expect(cell).toHaveAttribute("aria-current", "date");
          } else {
            await expect(cell).not.toHaveAttribute("aria-current");
          }
        }
      };

      await expectDays(THIS_WEEK, TODAY);

      // Selecting another day moves the mark and leaves the future flags alone.
      const other = TODAY === THIS_WEEK ? shift(THIS_WEEK, 1) : THIS_WEEK;

      await getCell(page, other).click();
      await expect(page).toHaveURL(new RegExp(`day=${other}`));
      await expectDays(THIS_WEEK, other);

      // A past week has no future day, a later week only future days.
      await clickControl(page, "Tuần trước", LAST_WEEK);
      await expectDays(LAST_WEEK, shift(other, -7));
      await expect(getCards(page, "data-future")).toHaveCount(0);

      await page.goto(`${surface.path()}?week=${NEXT_WEEK}`);
      await expect(getTitle(page)).toHaveText(expectedTitle(NEXT_WEEK));
      await expect(getCards(page, "data-future")).toHaveCount(7);
      await expect(
        getCells(page).and(page.locator('[aria-current="date"]')),
      ).toHaveCount(1);
      await expect(getCell(page, NEXT_WEEK)).toHaveAttribute(
        "aria-current",
        "date",
      );
    });

    test(`${surface.name}: no sideways scroll at 320 px and all 7 days fit`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 320, height: 700 });
      await page.reload();
      await expect(getCells(page)).toHaveCount(7);

      expect(await getHorizontalOverflow(page)).toBeLessThanOrEqual(0);

      for (const date of weekOf(THIS_WEEK)) {
        const cell = getCell(page, date);

        await expect(cell).toBeVisible();
        const box = await cell.boundingBox();

        expect(box).not.toBeNull();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(320);
        expect(box!.width).toBeGreaterThan(0);
      }
    });
  }

  for (const surface of SURFACES.filter((item) => item.hasStatus)) {
    test(`${surface.name}: the status dot is complete, partial or none by logged exercises`, async ({
      page,
    }) => {
      await page.goto(`${surface.path()}?week=${LAST_WEEK}`);
      await expect(getTitle(page)).toHaveText(expectedTitle(LAST_WEEK));

      // Day 1: both exercises logged. Day 2: one of two. Day 3: a workout with
      // nothing logged. The other days have no workout.
      const expected = ["complete", "partial", "none"];

      for (const [index, date] of weekOf(LAST_WEEK).entries()) {
        await expect(
          statusDot(getCell(page, date)),
          `status of ${date}`,
        ).toHaveAttribute("data-status", expected[index] ?? "none");
      }

      // This week has no workout for the trainee: every dot is "none".
      await page.goto(`${surface.path()}?week=${THIS_WEEK}`);
      await expect(getTitle(page)).toHaveText(expectedTitle(THIS_WEEK));
      await expect(getCard(page).getByTestId("day-status")).toHaveCount(7);
      await expect(
        getCard(page).locator(
          '[data-testid="day-status"]:not([data-status="none"])',
        ),
      ).toHaveCount(0);
    });
  }
});

const statusDot = (cell: Locator) => cell.getByTestId("day-status");
const getCards = (page: Page, attribute: string) =>
  getCells(page).and(page.locator(`[${attribute}]`));

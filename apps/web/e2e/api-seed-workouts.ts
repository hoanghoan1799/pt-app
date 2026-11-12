import { withApiDb } from "./api-db";
import {
  E2E_ADMIN,
  E2E_API_URL,
  E2E_LIFTER_NAME,
  E2E_USER_NAME,
  E2E_USER_PASSWORD,
  e2eEmail,
} from "./config";
import { E2E_EXERCISES, E2E_PT_EXERCISES, getE2eDates } from "./seed";

// Workout data of the e2e specs, created through the API's own endpoints (a PT
// plans the days, the trainee logs sets). Replaces the rows the legacy SQLite
// seed used to insert. Trainees must already exist (api-seed.ts).

type Json = Record<string, unknown>;

const call = async <T = Json>(
  method: string,
  path: string,
  { token, body }: { token?: string; body?: unknown } = {},
) => {
  const response = await fetch(`${E2E_API_URL}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(
      `e2e workouts: ${method} ${path} -> ${response.status} ${await response.text()}`,
    );
  }
  return (response.status === 204 ? {} : await response.json()) as T;
};

export const loginAdminApi = async () =>
  (
    await call<{ token: string }>("POST", "/v1/auth/admin/login", {
      body: {
        username: E2E_ADMIN.username,
        password: E2E_ADMIN.password,
        clientKind: "web",
      },
    })
  ).token;

export const loginTraineeApi = async (name: string) =>
  (
    await call<{ token: string }>("POST", "/v1/auth/login", {
      body: {
        email: e2eEmail(name),
        password: E2E_USER_PASSWORD,
        clientKind: "web",
      },
    })
  ).token;

export const findTraineeId = async (adminToken: string, name: string) => {
  const { trainees } = await call<{ trainees: { id: number; name: string }[] }>(
    "GET",
    `/v1/trainees?q=${encodeURIComponent(name)}`,
    { token: adminToken },
  );
  const found = trainees.find((trainee) => trainee.name === name);

  if (!found) {
    throw new Error(`e2e workouts: no trainee named "${name}"`);
  }
  return found.id;
};

// A new trainee that signs in with the shared e2e password. Returns its id.
export const createApiTrainee = async (adminToken: string, name: string) => {
  const created = await call<{ id: number; password: string }>(
    "POST",
    "/v1/trainees",
    { token: adminToken, body: { name, email: e2eEmail(name) } },
  );
  const { token } = await call<{ token: string }>("POST", "/v1/auth/login", {
    body: {
      email: e2eEmail(name),
      password: created.password,
      clientKind: "web",
    },
  });

  await call("POST", "/v1/users/me/password", {
    token,
    body: {
      currentPassword: created.password,
      newPassword: E2E_USER_PASSWORD,
    },
  });
  return created.id;
};

export const deleteApiTrainee = (adminToken: string, userId: number) =>
  call("DELETE", `/v1/trainees/${userId}`, { token: adminToken });

// The video id of an exercise title, as the legacy seed derived it.
export const e2eYoutubeId = (title: string) =>
  `e2e${title.replace(/\W/g, "")}`.padEnd(11, "0").slice(0, 11);

export interface PlannedExercise {
  title: string;
  sets: number | null;
  reps: string;
  youtubeId?: string;
}

export interface ApiExercise {
  id: number;
  title: string;
}

// A PT plans one day. Exercises keep their order.
export const planApiDay = async (
  adminToken: string,
  userId: number,
  date: string,
  exercises: PlannedExercise[],
  title = "E2E",
) => {
  await call("PUT", `/v1/trainees/${userId}/workout-days/${date}`, {
    token: adminToken,
    body: { title, note: "" },
  });

  const created: ApiExercise[] = [];

  for (const exercise of exercises) {
    created.push(
      await call<ApiExercise>(
        "POST",
        `/v1/trainees/${userId}/workout-days/${date}/exercises`,
        {
          token: adminToken,
          body: {
            title: exercise.title,
            sets: exercise.sets,
            reps: exercise.reps,
            description: "",
            youtubeUrl: exercise.youtubeId ?? e2eYoutubeId(exercise.title),
            confirmResetSets: false,
          },
        },
      ),
    );
  }
  return created;
};

export interface LoggedSetInput {
  weightKg: number | null;
  reps: number;
}

// The trainee logs sets. The API marks the exercise done when there is one;
// `keepCompletion: false` puts it back to "not done" (legacy seed: sets only).
export const logApiSets = async (
  traineeToken: string,
  exerciseId: number,
  sets: LoggedSetInput[],
  { keepCompletion = false }: { keepCompletion?: boolean } = {},
) => {
  await call("PUT", `/v1/me/exercises/${exerciseId}/sets`, {
    token: traineeToken,
    body: { sets },
  });
  if (!keepCompletion && sets.length > 0) {
    await call("PUT", `/v1/me/exercises/${exerciseId}/completion`, {
      token: traineeToken,
      body: { completed: false },
    });
  }
};

export const completeApiExercise = (traineeToken: string, exerciseId: number) =>
  call("PUT", `/v1/me/exercises/${exerciseId}/completion`, {
    token: traineeToken,
    body: { completed: true },
  });

// The trainee's own week as the API serves it (to find ids by title).
export const readTraineeDays = async (
  traineeToken: string,
  from: string,
  to: string,
) =>
  (
    await call<{
      days: {
        date: string;
        exercises: { id: number; title: string }[];
      }[];
    }>("GET", `/v1/me/workout-days?from=${from}&to=${to}`, {
      token: traineeToken,
    })
  ).days;

export const findApiExerciseId = async (
  traineeToken: string,
  date: string,
  title: string,
) => {
  const [day] = await readTraineeDays(traineeToken, date, date);
  const found = day?.exercises.find((exercise) => exercise.title === title);

  if (!found) {
    throw new Error(`e2e workouts: no exercise "${title}" on ${date}`);
  }
  return found.id;
};

// A PT's view of how many days of a trainee's week have content.
export const countApiPlannedDays = async (
  adminToken: string,
  userId: number,
  from: string,
  to: string,
) => {
  const { days } = await call<{
    days: { title: string; note: string; exercises: unknown[] }[];
  }>("GET", `/v1/trainees/${userId}/workout-days?from=${from}&to=${to}`, {
    token: adminToken,
  });

  return days.filter(
    (day) => day.title || day.note || day.exercises.length > 0,
  ).length;
};

// The API has no "delete a day" route; this clears planned days of one trainee
// in the e2e PostgreSQL (exercises, sets and completions cascade).
export const clearApiWorkoutDays = (name: string, from: string, to: string) =>
  withApiDb(async (client) => {
    await client.query(
      `DELETE FROM workout_days WHERE date >= $1 AND date <= $2
         AND user_id IN (SELECT id FROM users WHERE name = $3)`,
      [from, to, name],
    );
  });

const PREVIOUS_SETS: LoggedSetInput[] = [
  { weightKg: 40, reps: 10 },
  { weightKg: 40, reps: 8 },
  { weightKg: 35, reps: 10 },
];

export const seedApiWorkouts = async () => {
  const { today, previous, future } = getE2eDates();
  const admin = await loginAdminApi();

  // E2E Trainee: last week's session (sets only) and today's plan.
  const userId = await findTraineeId(admin, E2E_USER_NAME);
  const user = await loginTraineeApi(E2E_USER_NAME);
  const previousExercises = await planApiDay(admin, userId, previous, [
    { title: E2E_EXERCISES.BENCH, sets: 3, reps: "8-12" },
    { title: E2E_EXERCISES.SQUAT, sets: 3, reps: "8-12" },
  ]);

  for (const exercise of previousExercises) {
    await logApiSets(user, exercise.id, PREVIOUS_SETS);
  }

  const todayExercises = await planApiDay(admin, userId, today, [
    { title: E2E_EXERCISES.BENCH, sets: 3, reps: "8-12" },
    { title: E2E_EXERCISES.SQUAT, sets: 3, reps: "8-12" },
    { title: E2E_EXERCISES.ROWS, sets: 3, reps: "10" },
    { title: E2E_EXERCISES.PLANK, sets: 3, reps: "30s" },
    { title: E2E_EXERCISES.TIMED_LOGGED, sets: 2, reps: "30s" },
    { title: E2E_EXERCISES.PARTIAL, sets: 4, reps: "10" },
  ]);
  const timedLogged = todayExercises.find(
    (exercise) => exercise.title === E2E_EXERCISES.TIMED_LOGGED,
  );

  if (!timedLogged) {
    throw new Error("e2e workouts: missing timed exercise with sets");
  }
  await logApiSets(user, timedLogged.id, [
    { weightKg: 20, reps: 30 },
    { weightKg: null, reps: 25 },
  ]);
  await planApiDay(admin, userId, future, [
    { title: E2E_EXERCISES.FUTURE, sets: 3, reps: "10" },
  ]);

  // E2E Lifter (PT specs): two sessions; the squat beats last week's.
  const lifterId = await findTraineeId(admin, E2E_LIFTER_NAME);
  const lifter = await loginTraineeApi(E2E_LIFTER_NAME);
  const [previousSquat] = await planApiDay(admin, lifterId, previous, [
    { title: E2E_PT_EXERCISES.SQUAT, sets: 2, reps: "8-10" },
  ]);
  const [squat, press, , , link] = await planApiDay(admin, lifterId, today, [
    { title: E2E_PT_EXERCISES.SQUAT, sets: 2, reps: "8-10" },
    { title: E2E_PT_EXERCISES.PRESS, sets: 1, reps: "10" },
    { title: E2E_PT_EXERCISES.CURL, sets: 3, reps: "12" },
    { title: E2E_PT_EXERCISES.TEMP, sets: 3, reps: "12" },
    { title: E2E_PT_EXERCISES.LINK, sets: 1, reps: "10" },
    { title: E2E_PT_EXERCISES.STALE, sets: 1, reps: "10" },
  ]);

  await logApiSets(lifter, previousSquat.id, [
    { weightKg: 50, reps: 10 },
    { weightKg: 50, reps: 8 },
  ]);
  // Only the squat is done; the others have sets but no completion.
  await logApiSets(
    lifter,
    squat.id,
    [
      { weightKg: 55, reps: 8 },
      { weightKg: 50, reps: 10 },
    ],
    { keepCompletion: true },
  );
  // First ever weighted set: "Lần đầu", not a record.
  await logApiSets(lifter, press.id, [{ weightKg: 30, reps: 10 }]);
  // Only for the link-change test; it is wiped there.
  await logApiSets(lifter, link.id, [{ weightKg: 20, reps: 12 }]);
};

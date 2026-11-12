import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import type { DataSource } from "typeorm";

import { Clock } from "../../src/common/clock.js";
import { Food } from "../../src/database/entities/food.entity.js";
import { createTestApp } from "./app.js";
import {
  bearer,
  FakeClock,
  seedAdmin,
  seedUser,
  tokenOf,
} from "./auth.js";
import { createTestDatabase, type TestDatabase } from "./database.js";

// Per 100 g, the same seed values the web tests use.
export const FOODS = {
  chicken: { name: "Ức gà", protein: 31, carbs: 0, fat: 3.6, kcal: 165 },
  rice: { name: "Cơm trắng", protein: 2.7, carbs: 28.2, fat: 0.3, kcal: 130 },
  broccoli: { name: "Bông cải", protein: 2.4, carbs: 7.2, fat: 0.4, kcal: 34 },
  oil: { name: "Dầu ô liu", protein: 0, carbs: 0, fat: 100, kcal: 884 },
} as const;

let foodCounter = 0;

export const seedFood = async (
  dataSource: DataSource,
  food: {
    name?: string;
    protein: number;
    carbs: number;
    fat: number;
    kcal?: number;
    archived?: boolean;
  },
) => {
  const n = ++foodCounter;
  const name = food.name ?? `Food ${n}`;
  const row = await dataSource.getRepository(Food).save({
    name: `${name} ${n}`,
    nameKey: `${name.toLowerCase()} ${n}`,
    group: "other",
    kcal: food.kcal ?? food.protein * 4 + food.carbs * 4 + food.fat * 9,
    protein: food.protein,
    carbs: food.carbs,
    fat: food.fat,
    archivedAt: food.archived ? new Date() : null,
  });

  return row.id;
};

// A booted API with two PTs (each with one trainee), a super admin and an
// unassigned trainee, all signed in. The clock is fixed on Thursday 2026-11-12
// (Vietnam time), so "today" and the week are known.
export type NutritionWorld = {
  db: TestDatabase;
  app: INestApplication;
  ds: DataSource;
  clock: FakeClock;
  ids: {
    ptA: number;
    ptB: number;
    superAdmin: number;
    mine: number;
    theirs: number;
    unassigned: number;
  };
  tokens: {
    ptA: string;
    ptB: string;
    superAdmin: string;
    mine: string;
    theirs: string;
  };
  call: (
    method: "get" | "post" | "put" | "patch" | "delete",
    path: string,
    token?: string,
    body?: object,
  ) => request.Test;
  close: () => Promise<void>;
};

export const TODAY = "2026-11-12";
export const WEEK_START = "2026-11-09";

export const bootNutritionWorld = async (): Promise<NutritionWorld> => {
  const db = await createTestDatabase();
  const ds = db.dataSource;
  const clock = new FakeClock();
  const app = await createTestApp({
    databaseUrl: db.url,
    nodeEnv: "test",
    overrideProviders: [{ token: Clock, value: clock }],
  });

  const superAdmin = await seedAdmin(ds, { role: "super_admin" });
  const ptA = await seedAdmin(ds, { role: "pt" });
  const ptB = await seedAdmin(ds, { role: "pt" });
  const mine = await seedUser(ds, { ptAdminId: ptA.id });
  const theirs = await seedUser(ds, { ptAdminId: ptB.id });
  const unassigned = await seedUser(ds, { ptAdminId: null });

  const tokens = {
    superAdmin: await tokenOf(app, { kind: "admin", ...superAdmin }),
    ptA: await tokenOf(app, { kind: "admin", ...ptA }),
    ptB: await tokenOf(app, { kind: "admin", ...ptB }),
    mine: await tokenOf(app, { kind: "user", ...mine }),
    theirs: await tokenOf(app, { kind: "user", ...theirs }),
  };

  return {
    db,
    app,
    ds,
    clock,
    ids: {
      ptA: ptA.id,
      ptB: ptB.id,
      superAdmin: superAdmin.id,
      mine: mine.id,
      theirs: theirs.id,
      unassigned: unassigned.id,
    },
    tokens,
    call: (method, path, token, body) => {
      const call = request(app.getHttpServer())[method](`/v1${path}`);

      if (token) {
        call.set(bearer(token));
      }
      return body ? call.send(body) : call;
    },
    close: async () => {
      await app.close();
      await db.drop();
    },
  };
};

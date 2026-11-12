import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import {
  type CursorPage,
  FOOD_GROUP_VALUES,
  type FoodGroupsResponse,
  type FoodListQuery,
} from "@pt/contracts";
import { DataSource } from "typeorm";

import type { FoodRow } from "./foods.mapper.js";
import {
  buildFoodListSql,
  encodeCursor,
  FOOD_COLUMNS,
  type FoodCursor,
} from "./foods.search.js";

// Postgres integer ids: a bigger number can only be a missing food.
export const MAX_FOOD_ID = 2_147_483_647;

// Read models for the food library. Archived foods are hidden everywhere.
@Injectable()
export class FoodsQueries {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async list(query: FoodListQuery): Promise<CursorPage<FoodRow>> {
    const { sql, params } = buildFoodListSql(query);
    const rows: FoodRow[] = await this.dataSource.query(sql, params);
    const items = rows.slice(0, query.limit);
    const last = items.at(-1);
    const cursor: FoodCursor | null =
      rows.length > query.limit && last
        ? { nameKey: last.nameKey, id: last.id }
        : null;

    return { items, nextCursor: cursor ? encodeCursor(cursor) : null };
  }

  async findActive(id: number): Promise<FoodRow | null> {
    if (!Number.isInteger(id) || id <= 0 || id > MAX_FOOD_ID) {
      return null;
    }

    const rows: FoodRow[] = await this.dataSource.query(
      `SELECT ${FOOD_COLUMNS} FROM foods WHERE id = $1 AND archived_at IS NULL`,
      [id],
    );

    return rows[0] ?? null;
  }

  // A name is unique among active foods; `exceptId` skips the food being edited.
  async findActiveByNameKey(nameKey: string, exceptId?: number) {
    const rows: { id: number }[] = await this.dataSource.query(
      `SELECT id FROM foods
       WHERE name_key = $1 AND archived_at IS NULL AND ($2::int IS NULL OR id <> $2::int)`,
      [nameKey, exceptId ?? null],
    );

    return rows[0] ?? null;
  }

  // The groups that have a food (one filter chip each), in chip order.
  async groupsInUse(): Promise<FoodGroupsResponse["groups"]> {
    const rows: { group: (typeof FOOD_GROUP_VALUES)[number]; count: number }[] =
      await this.dataSource.query(
        `SELECT "group", count(*)::int AS count FROM foods
         WHERE archived_at IS NULL GROUP BY "group"`,
      );
    const counts = new Map(rows.map((row) => [row.group, row.count]));

    return FOOD_GROUP_VALUES.filter((group) => counts.has(group)).map(
      (group) => ({ group, count: counts.get(group) as number }),
    );
  }
}

import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource, type EntityManager, In } from "typeorm";

import { Food } from "../database/entities/food.entity.js";

// What nutrition needs to know about a food, per 100 g.
export type FoodFacts = {
  id: number;
  name: string;
  nameKey: string;
  nameEn: string | null;
  nameZh: string | null;
  group: Food["group"];
  state: Food["state"];
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  archivedAt: Date | null;
};

const SELECT = {
  id: true,
  name: true,
  nameKey: true,
  nameEn: true,
  nameZh: true,
  group: true,
  state: true,
  kcal: true,
  protein: true,
  carbs: true,
  fat: true,
  archivedAt: true,
} as const;

// READ-ONLY view of the `foods` table for meal plans, meal logs and food
// entries. The food library itself (create, edit, archive, search) belongs to
// the Foods module; when the two modules are merged, this class should become
// a thin wrapper over (or be replaced by) the Foods module's exported service.
@Injectable()
export class FoodsReader {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  // An active (not archived) food: the only kind that can be added anew.
  async findActive(
    id: number,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<FoodFacts | null> {
    const food = await manager.getRepository(Food).findOne({
      where: { id },
      select: SELECT,
    });

    return food && food.archivedAt === null ? food : null;
  }

  // Archived or not: a log or plan that already uses a food keeps working.
  async findAny(
    id: number,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<FoodFacts | null> {
    return manager
      .getRepository(Food)
      .findOne({ where: { id }, select: SELECT });
  }

  async findManyAny(
    ids: number[],
    manager: EntityManager = this.dataSource.manager,
  ): Promise<Map<number, FoodFacts>> {
    if (ids.length === 0) {
      return new Map();
    }

    const foods = await manager
      .getRepository(Food)
      .find({ where: { id: In(ids) }, select: SELECT });

    return new Map(foods.map((food) => [food.id, food]));
  }
}

import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import type { mealPreferencesSchema } from "@pt/contracts";
import { DataSource } from "typeorm";
import type { z } from "zod";

import { User } from "../database/entities/user.entity.js";

export type MealPreferencesBody = z.infer<typeof mealPreferencesSchema>;

// Q1: the trainee's own request for the PT: meals per day and foods they like
// or avoid. Both may be cleared.
@Injectable()
export class MealPreferencesService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async save(userId: number, body: MealPreferencesBody) {
    await this.dataSource.getRepository(User).update(
      { id: userId },
      { preferredMealCount: body.mealCount, foodNote: body.foodNote },
    );
    return { preferredMealCount: body.mealCount, foodNote: body.foodNote };
  }
}

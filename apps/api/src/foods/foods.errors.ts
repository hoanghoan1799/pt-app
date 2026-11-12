import { ConflictException, NotFoundException } from "@nestjs/common";
import { FOOD_ERROR_CODES, FOOD_MESSAGES } from "@pt/contracts";

// Missing, archived and malformed ids all answer the same way, like the web.
export class FoodNotFoundError extends NotFoundException {
  constructor() {
    super({
      code: FOOD_ERROR_CODES.NOT_FOUND,
      message: FOOD_MESSAGES.NOT_FOUND,
    });
  }
}

// `details.field` tells the form which input to mark (the web's fieldErrors).
export class FoodNameTakenError extends ConflictException {
  constructor() {
    super({
      code: FOOD_ERROR_CODES.NAME_TAKEN,
      message: FOOD_MESSAGES.NAME_TAKEN,
      details: { field: "name" },
    });
  }
}

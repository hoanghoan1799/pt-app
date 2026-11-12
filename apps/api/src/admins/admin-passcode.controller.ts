import {
  Body,
  Controller,
  Delete,
  HttpCode,
  Post,
  Put,
  UseGuards,
} from "@nestjs/common";
import { ApiBody, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { ThrottlerGuard } from "@nestjs/throttler";
import {
  type ChangePasscodeRequest,
  changePasscodeRequestSchema,
  passcodeStatusResponseSchema,
  type RemovePasscodeRequest,
  removePasscodeRequestSchema,
  type ResetPasscodeRequest,
  resetPasscodeRequestSchema,
  type RevealHiddenUsersRequest,
  revealHiddenUsersRequestSchema,
  revealHiddenUsersResponseSchema,
  type SetPasscodeRequest,
  setPasscodeRequestSchema,
  type VerifyPasscodeRequest,
  verifyPasscodeRequestSchema,
} from "@pt/contracts";

import type { AdminActor } from "../auth/actor.js";
import { Actor, Admin, AllowLocked } from "../auth/decorators/index.js";
import { toPasscodeStatusResponse } from "../auth/mappers.js";
import { ApiErrors } from "../common/openapi/api-errors.js";
import { toOpenApiSchema } from "../common/openapi/zod-schema.js";
import { AdminPasscodeService } from "./admin-passcode.service.js";

const status = toOpenApiSchema(passcodeStatusResponseSchema);

// Admin passcode lock. HTTP only; the rules live in AdminPasscodeService.
@ApiTags("admins")
@Controller("admins/me")
export class AdminPasscodeController {
  constructor(private readonly passcode: AdminPasscodeService) {}

  @Put("passcode")
  @Admin()
  @ApiBody({ schema: toOpenApiSchema(setPasscodeRequestSchema, "input") })
  @ApiOkResponse({ schema: status, description: "First passcode set" })
  @ApiErrors(400, 401, 403, 409)
  async set(
    @Actor() actor: AdminActor,
    @Body({ schema: setPasscodeRequestSchema }) body: SetPasscodeRequest,
  ) {
    return toPasscodeStatusResponse(
      await this.passcode.set(actor, body.passcode),
    );
  }

  @Post("passcode/change")
  @Admin()
  @UseGuards(ThrottlerGuard)
  @HttpCode(200)
  @ApiBody({ schema: toOpenApiSchema(changePasscodeRequestSchema, "input") })
  @ApiOkResponse({ schema: status, description: "Passcode changed" })
  @ApiErrors(400, 401, 403, 429)
  async change(
    @Actor() actor: AdminActor,
    @Body({ schema: changePasscodeRequestSchema }) body: ChangePasscodeRequest,
  ) {
    return toPasscodeStatusResponse(
      await this.passcode.change(actor, body.currentPasscode, body.newPasscode),
    );
  }

  @Delete("passcode")
  @Admin()
  @UseGuards(ThrottlerGuard)
  @ApiBody({ schema: toOpenApiSchema(removePasscodeRequestSchema, "input") })
  @ApiOkResponse({ schema: status, description: "Passcode turned off" })
  @ApiErrors(400, 401, 403, 409, 429)
  async remove(
    @Actor() actor: AdminActor,
    @Body({ schema: removePasscodeRequestSchema }) body: RemovePasscodeRequest,
  ) {
    return toPasscodeStatusResponse(
      await this.passcode.remove(actor, body.currentPasscode),
    );
  }

  // The lock screen: callable by a locked admin.
  @Post("passcode/verify")
  @Admin()
  @AllowLocked()
  @UseGuards(ThrottlerGuard)
  @HttpCode(200)
  @ApiBody({ schema: toOpenApiSchema(verifyPasscodeRequestSchema, "input") })
  @ApiOkResponse({ schema: status, description: "Unlocked for 5 minutes" })
  @ApiErrors(400, 401, 403, 429)
  async verify(
    @Actor() actor: AdminActor,
    @Body({ schema: verifyPasscodeRequestSchema }) body: VerifyPasscodeRequest,
  ) {
    return toPasscodeStatusResponse(
      await this.passcode.verify(actor, body.passcode),
    );
  }

  @Post("passcode/reset")
  @Admin()
  @AllowLocked()
  @UseGuards(ThrottlerGuard)
  @HttpCode(200)
  @ApiBody({ schema: toOpenApiSchema(resetPasscodeRequestSchema, "input") })
  @ApiOkResponse({
    schema: status,
    description: "New passcode set after proving the account password",
  })
  @ApiErrors(400, 401, 429)
  async reset(
    @Actor() actor: AdminActor,
    @Body({ schema: resetPasscodeRequestSchema }) body: ResetPasscodeRequest,
  ) {
    return toPasscodeStatusResponse(
      await this.passcode.reset(actor, body.password, body.newPasscode),
    );
  }

  @Post("passcode/lock")
  @Admin()
  @AllowLocked()
  @HttpCode(200)
  @ApiOkResponse({ schema: status, description: "Locked at once" })
  @ApiErrors(400, 401)
  async lock(@Actor() actor: AdminActor) {
    return toPasscodeStatusResponse(await this.passcode.lock(actor));
  }

  // Hidden-trainee reveal: only the right passcode answers `revealed: true`.
  @Post("hidden-users/reveal")
  @Admin()
  @UseGuards(ThrottlerGuard)
  @HttpCode(200)
  @ApiBody({
    schema: toOpenApiSchema(revealHiddenUsersRequestSchema, "input"),
  })
  @ApiOkResponse({
    schema: toOpenApiSchema(revealHiddenUsersResponseSchema),
    description: "Same answer for a wrong code, no passcode or a limited admin",
  })
  @ApiErrors(400, 401, 403, 429)
  async reveal(
    @Actor() actor: AdminActor,
    @Body({ schema: revealHiddenUsersRequestSchema })
    body: RevealHiddenUsersRequest,
  ) {
    const until = await this.passcode.reveal(actor, body.passcode);

    return {
      revealed: until !== null,
      revealedUntil: until ? until.toISOString() : null,
    };
  }
}

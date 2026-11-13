import { createParamDecorator, type ExecutionContext } from "@nestjs/common";

import type { AuthedRequest } from "../auth/decorators/index.js";

// The trainee id the PtScopeGuard approved for this request (`:userId`).
export const ScopedUserId = createParamDecorator(
  (_data, context: ExecutionContext) => {
    const id = context.switchToHttp().getRequest<AuthedRequest>().scopedUserId;

    if (id === undefined) {
      throw new Error(
        "@ScopedUserId() used on a route without @ScopedToTrainee()",
      );
    }
    return id;
  },
);

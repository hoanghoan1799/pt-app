import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { AUTH_MESSAGES } from "@pt/contracts";

// Every error carries a stable `code` and a message the client may show. The
// exception filter returns both for 4xx and nothing else (never a cause).

export class InvalidCredentialsError extends UnauthorizedException {
  constructor(message: string) {
    super({ code: "INVALID_CREDENTIALS", message });
  }
}

export class LoginLockedError extends HttpException {
  constructor() {
    super(
      { code: "LOGIN_LOCKED", message: AUTH_MESSAGES.LOGIN_LOCKED },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

export class SessionInvalidError extends UnauthorizedException {
  constructor() {
    super({ code: "SESSION_INVALID", message: AUTH_MESSAGES.SESSION_INVALID });
  }
}

export class SessionNotFoundError extends NotFoundException {
  constructor() {
    super({
      code: "SESSION_NOT_FOUND",
      message: AUTH_MESSAGES.SESSION_NOT_FOUND,
    });
  }
}

export class RoleForbiddenError extends ForbiddenException {
  constructor() {
    super({ code: "FORBIDDEN", message: AUTH_MESSAGES.FORBIDDEN });
  }
}

export class AdminLockedError extends ForbiddenException {
  constructor() {
    super({ code: "ADMIN_LOCKED", message: AUTH_MESSAGES.ADMIN_LOCKED });
  }
}

// A trainee outside the workspace, a hidden one and a missing one look the same.
export class TraineeNotFoundError extends NotFoundException {
  constructor() {
    super({
      code: "TRAINEE_NOT_FOUND",
      message: AUTH_MESSAGES.TRAINEE_NOT_FOUND,
    });
  }
}

export class PasscodeNotSetError extends HttpException {
  constructor() {
    super(
      { code: "PASSCODE_NOT_SET", message: AUTH_MESSAGES.PASSCODE_NOT_SET },
      HttpStatus.BAD_REQUEST,
    );
  }
}

export class PasscodeWrongError extends ForbiddenException {
  constructor(attemptsLeft: number) {
    super({
      code: "PASSCODE_WRONG",
      message: AUTH_MESSAGES.PASSCODE_WRONG,
      details: { attemptsLeft, signedOut: false },
    });
  }
}

// The 5th wrong passcode: the session is gone, the client must log in again.
export class PasscodeSignedOutError extends UnauthorizedException {
  constructor() {
    super({
      code: "PASSCODE_SIGNED_OUT",
      message: AUTH_MESSAGES.PASSCODE_SIGNED_OUT,
      details: { attemptsLeft: 0, signedOut: true },
    });
  }
}

export const conflict = (code: string, message: string) =>
  new HttpException({ code, message }, HttpStatus.CONFLICT);

export const badRequest = (code: string, message: string) =>
  new HttpException({ code, message }, HttpStatus.BAD_REQUEST);

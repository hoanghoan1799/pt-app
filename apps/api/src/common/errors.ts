import { HttpException, HttpStatus } from "@nestjs/common";

// `{ code, message }` errors. The AllExceptionsFilter turns them into the
// shared `{ code, message, ref }` body; 4xx text reaches the client.

export const notFoundError = (code: string, message: string) =>
  new HttpException({ code, message }, HttpStatus.NOT_FOUND);

export const payloadTooLargeError = (code: string, message: string) =>
  new HttpException({ code, message }, HttpStatus.PAYLOAD_TOO_LARGE);

// PostgreSQL unique_violation, as thrown by the pg driver through TypeORM.
export const isUniqueViolation = (error: unknown): boolean => {
  const driver =
    typeof error === "object" && error !== null
      ? (error as { driverError?: { code?: string }; code?: string })
      : {};

  return (driver.driverError?.code ?? driver.code) === "23505";
};

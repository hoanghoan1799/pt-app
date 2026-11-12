import type { INestApplication } from "@nestjs/common";
import request from "supertest";

export type Method = "get" | "post" | "put" | "patch" | "delete";

// One authenticated request; no token sends none.
export const call = (
  app: INestApplication,
  method: Method,
  path: string,
  token?: string | null,
  body?: object,
) => {
  const req = request(app.getHttpServer())[method](path);

  if (token) {
    req.set("Authorization", `Bearer ${token}`);
  }
  return body === undefined ? req : req.send(body);
};

// A real 1x1 PNG.
export const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
export const PNG_URL = `data:image/png;base64,${PNG_BASE64}`;

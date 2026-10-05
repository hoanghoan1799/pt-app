import { jwtVerify, SignJWT } from "jose";
import { z } from "zod";

import { MIN_SESSION_SECRET_LENGTH } from "@/constants/session";
import type { SessionPayload } from "@/types/session";

const SESSION_PAYLOAD_SCHEMA = z.discriminatedUnion("role", [
  z.object({ role: z.literal("admin") }),
  z.object({ role: z.literal("user"), userId: z.number().int().positive() }),
]);

const getSecretKey = () => {
  const secret = process.env.SESSION_SECRET;

  if (!secret || secret.length < MIN_SESSION_SECRET_LENGTH) {
    throw new Error(
      `SESSION_SECRET must be set to at least ${MIN_SESSION_SECRET_LENGTH} characters`,
    );
  }
  return new TextEncoder().encode(secret);
};

export const signSession = (payload: SessionPayload, maxAgeSeconds: number) =>
  new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${maxAgeSeconds}s`)
    .sign(getSecretKey());

export const verifySession = async (
  token: string | undefined,
): Promise<SessionPayload | null> => {
  if (!token) {
    return null;
  }

  try {
    const { payload } = await jwtVerify(token, getSecretKey(), {
      algorithms: ["HS256"],
    });
    const parsed = SESSION_PAYLOAD_SCHEMA.safeParse(payload);

    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
};

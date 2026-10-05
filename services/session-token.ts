import { jwtVerify, SignJWT } from "jose";
import { z } from "zod";

import { getSessionSecret } from "@/services/env";
import type { SessionPayload, VerifiedSession } from "@/types/session";

const SESSION_PAYLOAD_SCHEMA = z.discriminatedUnion("role", [
  z.object({ role: z.literal("admin"), adminId: z.number().int().positive() }),
  z.object({ role: z.literal("user"), userId: z.number().int().positive() }),
]);

const getSecretKey = () => new TextEncoder().encode(getSessionSecret());

export const signSession = (payload: SessionPayload, maxAgeSeconds: number) =>
  new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${maxAgeSeconds}s`)
    .sign(getSecretKey());

export const getSessionCookieOptions = (maxAge: number) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge,
});

export const verifySession = async (
  token: string | undefined,
): Promise<VerifiedSession | null> => {
  if (!token) {
    return null;
  }

  try {
    const { payload } = await jwtVerify(token, getSecretKey(), {
      algorithms: ["HS256"],
    });
    const parsed = SESSION_PAYLOAD_SCHEMA.safeParse(payload);

    return parsed.success
      ? { ...parsed.data, issuedAt: payload.iat ?? 0 }
      : null;
  } catch {
    return null;
  }
};

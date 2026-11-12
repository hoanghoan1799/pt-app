import { describe, expect, it, vi } from "vitest";

import type { AdminActor } from "../auth/actor.js";
import type { PasswordHasher } from "../auth/password-hash.js";
import type { SessionsService } from "../auth/sessions.service.js";
import type { Clock } from "../common/clock.js";
import type { TraineeDeletionService } from "./trainee-deletion.service.js";
import { TraineesService } from "./trainees.service.js";

const now = new Date("2026-11-12T10:00:00.456Z");

// Repositories are faked per entity name so the use-case rules run without a
// database; the e2e tests cover the SQL.
const build = (rows: {
  user?: { id: number; emailKey: string | null } | null;
  ptExists?: boolean;
}) => {
  const update = vi.fn(async () => ({ affected: 1 }));
  const save = vi.fn(async (entity: object) => ({ id: 41, ...entity }));
  const users = {
    findOne: vi.fn(async () => rows.user ?? null),
    exists: vi.fn(async () => false),
    update,
    save,
    create: (entity: object) => entity,
  };
  const admins = { exists: vi.fn(async () => rows.ptExists ?? false) };
  const dataSource = {
    getRepository: (entity: { name: string }) =>
      entity.name === "User" ? users : admins,
  };
  const revokeAll = vi.fn(async () => undefined);
  const service = new TraineesService(
    dataSource as never,
    { hash: async (p: string) => `hashed:${p}` } as unknown as PasswordHasher,
    { revokeAll } as unknown as SessionsService,
    { now: () => now } as unknown as Clock,
    {} as TraineeDeletionService,
  );

  return { service, update, save, revokeAll, users };
};

const actor = (role: "pt" | "super_admin", id = 5) =>
  ({ id, role }) as unknown as AdminActor;

describe("TraineesService.resetPassword", () => {
  it("stores a new hash, stamps whole seconds and revokes every session of that trainee", async () => {
    const { service, update, revokeAll } = build({
      user: { id: 9, emailKey: "a@b.co" },
    });
    const { password } = await service.resetPassword(9);

    expect(password).toHaveLength(12);
    expect(update).toHaveBeenCalledWith(
      { id: 9 },
      {
        passwordHash: `hashed:${password}`,
        passwordChangedAt: new Date("2026-11-12T10:00:00.000Z"),
      },
    );
    expect(revokeAll).toHaveBeenCalledExactlyOnceWith({ kind: "user", id: 9 });
  });

  it("changes and revokes nothing for a trainee without a login or a missing one", async () => {
    const noLogin = build({ user: { id: 9, emailKey: null } });
    const missing = build({ user: null });

    await expect(noLogin.service.resetPassword(9)).rejects.toMatchObject({
      response: { code: "NO_LOGIN" },
    });
    await expect(missing.service.resetPassword(9)).rejects.toMatchObject({
      response: { code: "TRAINEE_NOT_FOUND" },
    });
    expect(noLogin.update).not.toHaveBeenCalled();
    expect(noLogin.revokeAll).not.toHaveBeenCalled();
    expect(missing.revokeAll).not.toHaveBeenCalled();
  });
});

describe("TraineesService.create PT resolution", () => {
  const input = { name: "Lan", email: "lan@x.co" };

  it("forces a PT's own workspace even when another PT is posted", async () => {
    const { service, save } = build({ ptExists: true });
    const created = await service.create(actor("pt", 5), {
      ...input,
      ptAdminId: 8,
    });

    expect(created.ptAdminId).toBe(5);
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ ptAdminId: 5 }),
    );
  });

  it("lets a super admin leave it empty or pick an existing PT", async () => {
    const empty = build({});
    const picked = build({ ptExists: true });

    expect(
      (await empty.service.create(actor("super_admin"), input)).ptAdminId,
    ).toBeNull();
    expect(
      (
        await picked.service.create(actor("super_admin"), {
          ...input,
          ptAdminId: 8,
        })
      ).ptAdminId,
    ).toBe(8);
  });

  it("rejects a PT that does not exist before writing anything", async () => {
    const { service, save } = build({ ptExists: false });

    await expect(
      service.create(actor("super_admin"), { ...input, ptAdminId: 8 }),
    ).rejects.toMatchObject({ response: { code: "PT_NOT_FOUND" } });
    expect(save).not.toHaveBeenCalled();
  });

  it("stores keys and a hash, and returns the plain password once", async () => {
    const { service, save } = build({});
    const created = await service.create(actor("pt"), {
      name: "Trần Minh",
      email: "Minh@X.co",
    });

    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        nameKey: "tran minh",
        emailKey: "minh@x.co",
        passwordHash: `hashed:${created.password}`,
        passwordChangedAt: new Date("2026-11-12T10:00:00.000Z"),
      }),
    );
  });
});

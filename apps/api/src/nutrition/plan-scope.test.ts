import { describe, expect, it } from "vitest";

import type { AdminActor } from "../auth/actor.js";
import { PtScopePolicy } from "../auth/policies/pt-scope.policy.js";
import type { TraineeScopeQueries } from "../auth/trainee-scope.queries.js";
import { generateOpenApiDocument } from "../openapi/generate.js";
import { PlanScope } from "./plan-scope.js";

const admin = (patch: Partial<AdminActor> = {}) =>
  ({
    id: 10,
    role: "pt",
    locked: false,
    revealed: false,
    ...patch,
  }) as AdminActor;

const scopeFor = (
  facts: { userId: number; ptAdminId: number | null; hidden: boolean } | null,
) =>
  new PlanScope(
    {
      findByUserId: () => Promise.resolve(facts),
    } as unknown as TraineeScopeQueries,
    new PtScopePolicy(),
  );

describe("PlanScope", () => {
  it("lets a PT reach a trainee of their own workspace", async () => {
    expect(
      await scopeFor({ userId: 1, ptAdminId: 10, hidden: false }).canAccess(
        admin(),
        1,
      ),
    ).toBe(true);
  });

  it("refuses another PT's trainee, an unassigned one and a missing one", async () => {
    expect(
      await scopeFor({ userId: 1, ptAdminId: 11, hidden: false }).canAccess(
        admin(),
        1,
      ),
    ).toBe(false);
    expect(
      await scopeFor({ userId: 1, ptAdminId: null, hidden: false }).canAccess(
        admin(),
        1,
      ),
    ).toBe(false);
    expect(await scopeFor(null).canAccess(admin(), 1)).toBe(false);
  });

  it("gives a super admin every existing trainee", async () => {
    expect(
      await scopeFor({ userId: 1, ptAdminId: 11, hidden: false }).canAccess(
        admin({ role: "super_admin" }),
        1,
      ),
    ).toBe(true);
    expect(
      await scopeFor(null).canAccess(admin({ role: "super_admin" }), 1),
    ).toBe(false);
  });

  it("hides a hidden trainee until revealed, and never serves a locked admin", async () => {
    const hidden = { userId: 1, ptAdminId: 10, hidden: true };

    expect(await scopeFor(hidden).canAccess(admin(), 1)).toBe(false);
    expect(await scopeFor(hidden).canAccess(admin({ revealed: true }), 1)).toBe(
      true,
    );
    expect(
      await scopeFor({ ...hidden, hidden: false }).canAccess(
        admin({ locked: true }),
        1,
      ),
    ).toBe(false);
  });
});

describe("OpenAPI for the nutrition module", () => {
  it("documents every endpoint under /v1", async () => {
    const document = (await generateOpenApiDocument()) as unknown as {
      paths: Record<string, Record<string, unknown>>;
    };
    const expected: Record<string, string[]> = {
      "/v1/me/nutrition": ["get"],
      "/v1/me/body-profile": ["put"],
      "/v1/me/weight-logs/{date}": ["put"],
      "/v1/me/food-entries": ["post"],
      "/v1/me/food-entries/{id}": ["put", "delete"],
      "/v1/me/meal-plan-days": ["get"],
      "/v1/me/meal-preferences": ["put"],
      "/v1/me/meals/{mealId}/logs": ["post"],
      "/v1/me/meal-logs/{id}": ["patch", "delete"],
      "/v1/me/meals/{mealId}/mark": ["put"],
      "/v1/trainees/{userId}/nutrition": ["get"],
      "/v1/trainees/{userId}/nutrition-target": ["put"],
      "/v1/trainees/{userId}/body-profile": ["put"],
      "/v1/trainees/{userId}/meal-plan-days": ["get", "post"],
      "/v1/trainees/{userId}/meal-plan-days/copy-info": ["get"],
      "/v1/trainees/{userId}/meal-plan-days/copy": ["post"],
      "/v1/trainees/{userId}/meal-plan-days/apply-last-week": ["post"],
      "/v1/meal-plan-days/{dayId}": ["delete"],
      "/v1/meal-plan-days/{dayId}/meals": ["post"],
      "/v1/meal-plan-days/{dayId}/meals/order": ["put"],
      "/v1/meal-plan-days/{dayId}/meals/shares": ["put"],
      "/v1/meals/{mealId}": ["delete", "patch"],
      "/v1/meals/{mealId}/items": ["post"],
      "/v1/meals/{mealId}/auto-solve": ["post"],
      "/v1/meal-items/{itemId}": ["delete", "patch"],
    };

    for (const [path, methods] of Object.entries(expected)) {
      expect(Object.keys(document.paths[path] ?? {}).sort(), path).toEqual(
        [...methods].sort(),
      );
    }
  });
});

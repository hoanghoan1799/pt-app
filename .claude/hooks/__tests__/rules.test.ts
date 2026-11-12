import { describe, expect, it } from "vitest";

import { findViolation } from "../rules.mjs";

describe("findViolation", () => {
  it.each([
    ["git status"],
    ["pnpm test && pnpm lint"],
    ["git push -u origin claude/kan-12-hooks"],
    ["git push --force-with-lease origin kan-12"],
    ['git commit -m "fix(KAN-14): typecheck"'],
    ["cat .env.example"],
    ['git commit -m "chore: deny reading .env files"'],
  ])("allows %s", (command) => {
    expect(findViolation(command, "kan-12")).toBeNull();
  });

  it.each([
    ["git push origin main", "kan-12"],
    ["git push origin HEAD:main", "kan-12"],
    ["git push", "main"],
    ["git push origin stag", "kan-12"],
    ["git push origin HEAD:refs/heads/stag", "kan-12"],
    ["git push", "stag"],
    ["git push origin kan-12 --force", "kan-12"],
    ["git push -f", "kan-12"],
    ['git commit --no-verify -m "wip"', "kan-12"],
    [
      'git commit -m "x\n\nCo-Authored-By: Claude <noreply@anthropic.com>"',
      "kan-12",
    ],
    ['git commit -m "x\n\nClaude-Session: https://claude.ai/code/1"', "kan-12"],
    ["cat .env.local", "kan-12"],
    ["grep SECRET .env", "kan-12"],
    ['git add .env.local && git commit -m "add config"', "kan-12"],
  ])("blocks %s", (command, branch) => {
    expect(findViolation(command, branch)).toEqual(expect.any(String));
  });

  describe("copying the env template (README setup)", () => {
    const fresh = { envLocalExists: false };
    const configured = { envLocalExists: true };

    it.each([
      ["cp .env.example .env.local", fresh],
      ["cp ./.env.example ./.env.local && pnpm db:push", fresh],
      ["cp -n .env.example .env.local", configured],
      ["cp apps/web/.env.example apps/web/.env.local", fresh],
    ])("allows %s", (command, options) => {
      expect(findViolation(command, "kan-15", options)).toBeNull();
    });

    it.each([
      ["cp .env.example .env.local", configured],
      ["cp .env.example .env.local && cat .env.local", fresh],
      ["cp .env.example .env.production", fresh],
      ["cp apps/web/.env.example apps/web/.env.local", configured],
    ])("blocks %s", (command, options) => {
      expect(findViolation(command, "kan-15", options)).toEqual(
        expect.any(String),
      );
    });
  });
});

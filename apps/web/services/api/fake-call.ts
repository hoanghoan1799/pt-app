import { ApiError } from "@/services/api/errors";

// A fake of `callApi` / `tryApi` for unit tests of server actions and queries.
// It records every request the code makes and answers with what the test says,
// so a test checks "which endpoint, with what" and "how the answer is shown"
// without a server. Use it from a `vi.mock` factory:
//
//   vi.mock("@/services/api/call", async () => {
//     const { createFakeApi } = await import("@/services/api/fake-call");
//     const fake = createFakeApi();
//
//     return { callApi: fake.callApi, tryApi: fake.tryApi, fake };
//   });
//
// The rules themselves are the API's and are tested by its e2e tests.

export interface FakeRequest {
  actor: string;
  method: string;
  path: string;
  params?: { path?: Record<string, unknown>; query?: Record<string, unknown> };
  body?: unknown;
}

type Init = { params?: FakeRequest["params"]; body?: unknown };

export const createFakeApi = () => {
  const requests: FakeRequest[] = [];
  // Answers in order; the last one repeats.
  let answers: ({ data: unknown } | { error: ApiError })[] = [{ data: {} }];

  const answer = () =>
    answers.length > 1
      ? (answers.shift() as (typeof answers)[number])
      : answers[0];

  const tryApi = async (
    actor: string,
    run: (api: Record<string, unknown>) => Promise<unknown>,
  ) => {
    const record = (method: string) => async (path: string, init?: Init) => {
      requests.push({
        actor,
        method,
        path,
        params: init?.params,
        body: init?.body,
      });
      return {};
    };

    await run({
      GET: record("GET"),
      PUT: record("PUT"),
      POST: record("POST"),
      PATCH: record("PATCH"),
      DELETE: record("DELETE"),
    });

    const next = answer();

    return "error" in next
      ? { ok: false as const, error: next.error }
      : { ok: true as const, data: next.data };
  };

  const callApi = async (
    actor: string,
    run: (api: Record<string, unknown>) => Promise<unknown>,
  ) => {
    const outcome = await tryApi(actor, run);

    if (!outcome.ok) {
      throw outcome.error;
    }
    return outcome.data;
  };

  return {
    requests,
    tryApi,
    callApi,
    reset: () => {
      requests.length = 0;
      answers = [{ data: {} }];
    },
    // The next requests succeed with these bodies, in order.
    reply: (...data: unknown[]) => {
      answers = data.map((item) => ({ data: item }));
    },
    // The next request is refused like the API does (4xx with its message).
    refuse: (status: number, code: string, message: string) => {
      answers = [{ error: new ApiError({ status, code, message }) }];
    },
  };
};

export type FakeApi = ReturnType<typeof createFakeApi>;

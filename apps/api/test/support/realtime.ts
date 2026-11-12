import type { AddressInfo } from "node:net";

import type { INestApplication } from "@nestjs/common";
import { REALTIME_NAMESPACE } from "@pt/contracts";
import { io, type Socket } from "socket.io-client";

// Real Socket.IO clients against the app listening on a random port.

export const listenOnRandomPort = async (app: INestApplication) => {
  await app.listen(0, "127.0.0.1");
  const { port } = app.getHttpServer().address() as AddressInfo;

  return `http://127.0.0.1:${port}`;
};

export type Received = { name: string; data: Record<string, unknown> };

export type TestClient = {
  socket: Socket;
  received: Received[];
  // Events of one name received so far.
  named: (name: string) => Record<string, unknown>[];
  // Resolves with the first event of that name received after this call (or
  // already received since `mark`).
  waitFor: (
    name: string,
    predicate?: (data: Record<string, unknown>) => boolean,
    timeoutMs?: number,
  ) => Promise<Record<string, unknown>>;
  // Sends a client event and resolves with the acknowledgement.
  ask: (
    event: string,
    data?: unknown,
  ) => Promise<{ ok: boolean; code?: string; relayed?: boolean }>;
  disconnected: () => Promise<string>;
  close: () => void;
};

export type Rejection = { message: string; code?: string };

// Connects, or rejects with the code the server refused the handshake with.
export const connectClient = (
  url: string,
  auth: Record<string, unknown>,
  headers: Record<string, string> = {},
): Promise<TestClient> =>
  new Promise((resolve, reject) => {
    const socket = io(`${url}${REALTIME_NAMESPACE}`, {
      auth,
      transports: ["websocket"],
      extraHeaders: headers,
      reconnection: false,
      forceNew: true,
    });
    const received: Received[] = [];
    const waiters: {
      name: string;
      predicate: (data: Record<string, unknown>) => boolean;
      done: (data: Record<string, unknown>) => void;
    }[] = [];

    socket.onAny((name: string, data: Record<string, unknown>) => {
      received.push({ name, data });
      for (const waiter of [...waiters]) {
        if (waiter.name === name && waiter.predicate(data)) {
          waiters.splice(waiters.indexOf(waiter), 1);
          waiter.done(data);
        }
      }
    });
    socket.once(
      "connect_error",
      (error: Error & { data?: { code?: string } }) => {
        socket.close();
        reject({
          message: error.message,
          code: error.data?.code,
        } satisfies Rejection);
      },
    );
    socket.once("connect", () => {
      resolve({
        socket,
        received,
        named: (name) =>
          received
            .filter((item) => item.name === name)
            .map((item) => item.data),
        waitFor: (name, predicate = () => true, timeoutMs = 4000) =>
          new Promise((done, fail) => {
            const seen = received.find(
              (item) => item.name === name && predicate(item.data),
            );

            if (seen) {
              done(seen.data);
              return;
            }
            const timer = setTimeout(
              () =>
                fail(new Error(`No "${name}" event within ${timeoutMs} ms`)),
              timeoutMs,
            );

            waiters.push({
              name,
              predicate,
              done: (data) => {
                clearTimeout(timer);
                done(data);
              },
            });
          }),
        ask: (event, data) =>
          new Promise((done) => {
            socket.emit(event, data, done);
          }),
        disconnected: () =>
          new Promise((done) => {
            if (socket.disconnected) {
              done("already");
              return;
            }
            socket.once("disconnect", (reason) => done(reason));
          }),
        close: () => {
          socket.close();
        },
      });
    });
  });

export const pause = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

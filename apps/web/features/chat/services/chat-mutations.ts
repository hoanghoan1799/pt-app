import "server-only";

import type { ChatSendMessageRequest } from "@pt/contracts";

import { CHAT_MESSAGES } from "@/features/chat/constants/messages";
import type { ChatMessage } from "@/features/chat/services/chat-queries";
import { webizeUrls } from "@/features/chat/utils/api-urls";
import { tryApi } from "@/services/api/call";
import type { ApiError } from "@/services/api/errors";

// Sending, reacting, editing and unsending go through the API, which checks
// the session, the chat lock and ownership. Message bodies are never logged.

export type MutationResult =
  | { status: "success"; message: ChatMessage }
  | { status: "error"; message: string };

export const fail = (message: string): MutationResult => ({
  status: "error",
  message,
});

// A refused request shows the API's own text; a malformed one the generic
// "invalid message".
export const failFrom = (error: ApiError) =>
  fail(
    error.code === "VALIDATION_FAILED"
      ? CHAT_MESSAGES.INVALID_INPUT
      : error.message,
  );

type Outcome = Awaited<ReturnType<typeof tryApi<{ message: ChatMessage }>>>;

const toResult = (outcome: Outcome): MutationResult =>
  outcome.ok
    ? { status: "success", message: webizeUrls(outcome.data.message) }
    : failFrom(outcome.error);

export type SendBody = Omit<ChatSendMessageRequest, "clientId"> & {
  clientId: string;
};

// `clientId` is the idempotency key: a retried send returns the stored message.
export const sendAsUser = async (input: SendBody) =>
  toResult(
    (await tryApi("user", (api) =>
      api.POST("/v1/chat/conversations/me/messages", {
        params: { header: { "Idempotency-Key": input.clientId } },
        body: input,
      }),
    )) as Outcome,
  );

export const sendAsAdmin = async (userId: number, input: SendBody) =>
  toResult(
    (await tryApi("admin", (api) =>
      api.POST("/v1/chat/trainees/{userId}/messages", {
        params: {
          path: { userId },
          header: { "Idempotency-Key": input.clientId },
        },
        body: input,
      }),
    )) as Outcome,
  );

type Actor = "user" | "admin";

// One reaction per person per message: another emoji replaces it, the same
// emoji or null removes it.
export const reactToMessage = async (
  actor: Actor,
  messageId: number,
  emoji: string | null,
) =>
  toResult(
    (await tryApi(actor, (api) =>
      emoji === null
        ? api.DELETE("/v1/chat/messages/{mid}/reaction", {
            params: { path: { mid: messageId } },
          })
        : api.PUT("/v1/chat/messages/{mid}/reaction", {
            params: { path: { mid: messageId } },
            body: { emoji: emoji as never },
          }),
    )) as Outcome,
  );

export const editChatMessage = async (
  actor: Actor,
  messageId: number,
  body: string,
) =>
  toResult(
    (await tryApi(actor, (api) =>
      api.PATCH("/v1/chat/messages/{mid}", {
        params: { path: { mid: messageId } },
        body: { body },
      }),
    )) as Outcome,
  );

// Unsend for everyone: idempotent.
export const unsendChatMessage = async (actor: Actor, messageId: number) =>
  toResult(
    (await tryApi(actor, (api) =>
      api.DELETE("/v1/chat/messages/{mid}", {
        params: { path: { mid: messageId } },
      }),
    )) as Outcome,
  );

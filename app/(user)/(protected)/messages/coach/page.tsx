import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { ROUTES } from "@/constants/routes";
import { listAdminAvatarUrls } from "@/features/avatar/services/avatar";
import { TraineeChatThread } from "@/features/chat/components/TraineeChatThread";
import { isChatEnabled } from "@/features/chat/services/chat-permission";
import {
  findConversationByUserId,
  findLatestAdminSenderName,
  getOrCreateConversation,
  listMessagesAround,
} from "@/features/chat/services/chat-queries";
import { loadCoachReplyPostFor } from "@/features/chat/services/chat-reply-post";
import { loadTraineeThread } from "@/features/chat/services/chat-thread";
import { parseJumpId } from "@/features/chat/utils/chat-links";
import { serializeMessage } from "@/features/chat/utils/chat-thread-rules";
import { actorOfUser } from "@/features/social/services/post-context";
import { parseDmId } from "@/features/social/utils/dm-rules";
import { listVerifiedAdminIds } from "@/services/admins";
import { requireUser } from "@/services/auth-guard";
import { readSearchParam } from "@/utils/search-params";

export const generateMetadata = async (): Promise<Metadata> => {
  const t = await getTranslations("chat.pages");

  return { title: t("messagesTitle") };
};

const CoachChatPage = async ({
  searchParams,
}: PageProps<"/messages/coach">) => {
  const user = await requireUser();
  const chatEnabled = isChatEnabled(user);
  const existing = await findConversationByUserId(user.id);

  // Chat off: the thread opens read-only (old messages, if any, and the
  // locked banner); no conversation is created for it.
  // The realtime token is scoped to the conversation, so make sure it exists.
  const conversation =
    existing ?? (chatEnabled ? await getOrCreateConversation(user.id) : null);
  const result = await loadTraineeThread(user, {}, {});

  if (result.notModified) {
    // Unreachable without `after`; keeps the type honest.
    redirect(ROUTES.WORKOUTS);
  }
  const { payload } = result;
  // `?m=<id>`: open at that message (from the gallery or a search result).
  const query = await searchParams;
  const jumpId = parseJumpId(query.m);
  // `?replyPost=<id>`: a PT's post quoted above the composer; only when the
  // chat is open for writing and the viewer may quote that post.
  const replyPostId = parseDmId(readSearchParam(query.replyPost) ?? "");
  const replyPost =
    replyPostId !== null && chatEnabled
      ? await loadCoachReplyPostFor(actorOfUser(user), replyPostId, user.id)
      : null;
  const around =
    jumpId !== null && existing
      ? await listMessagesAround(existing.id, jumpId, actorOfUser(user))
      : null;
  const adminAvatars = await listAdminAvatarUrls();
  const peerName = existing
    ? await findLatestAdminSenderName(existing.id)
    : null;

  return (
    <TraineeChatThread
      initialPeerName={peerName}
      verifiedAdminIds={await listVerifiedAdminIds()}
      userId={user.id}
      avatars={Object.fromEntries(
        [...adminAvatars].map(([id, url]) => [`admin:${id}`, url]),
      )}
      conversationId={conversation?.id ?? null}
      replyPost={replyPost}
      jumpToId={around ? jumpId : null}
      initial={{
        ...payload,
        messages: (around?.messages ?? payload.messages).map(serializeMessage),
        hasMore: around?.hasMore ?? payload.hasMore,
        // Without `changedSince` the payload has no changes to carry.
        changes: [],
      }}
    />
  );
};

export default CoachChatPage;

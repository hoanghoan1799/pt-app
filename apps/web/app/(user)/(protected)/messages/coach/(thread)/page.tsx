import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { listAdminAvatarUrls } from "@/features/avatar/services/avatar";
import { TraineeChatThread } from "@/features/chat/components/TraineeChatThread";
import {
  loadMyThread,
  loadMyThreadAround,
} from "@/features/chat/services/chat-queries";
import { loadCoachReplyPostFor } from "@/features/chat/services/chat-reply-post";
import { parseJumpId } from "@/features/chat/utils/chat-links";
import { serializeMessage } from "@/features/chat/utils/chat-thread-rules";
import { isEmbedParam } from "@/features/chat-bubbles/utils/bubble-links";
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
  // `?m=<id>`: open at that message (from the gallery or a search result).
  const query = await searchParams;
  const jumpId = parseJumpId(query.m);
  // Chat off: the thread opens read-only (old messages, if any, and the
  // locked banner). The conversation exists once the trainee wrote or a PT
  // wrote to them; the thread says which.
  const jump = jumpId === null ? null : await loadMyThreadAround(jumpId);
  const payload = jump ?? (await loadMyThread());
  const chatEnabled = payload.chatEnabled;
  // `?replyPost=<id>`: a PT's post quoted above the composer; only when the
  // chat is open for writing and the viewer may quote that post.
  const replyPostId = parseDmId(readSearchParam(query.replyPost) ?? "");
  const replyPost =
    replyPostId !== null && chatEnabled
      ? await loadCoachReplyPostFor("user", replyPostId, user.id)
      : null;
  const adminAvatars = await listAdminAvatarUrls();

  return (
    <TraineeChatThread
      initialPeerName={payload.latestPt?.name ?? null}
      verifiedAdminIds={await listVerifiedAdminIds()}
      userId={user.id}
      isEmbed={isEmbedParam(query.embed)}
      avatars={Object.fromEntries(
        [...adminAvatars].map(([id, url]) => [`admin:${id}`, url]),
      )}
      conversationId={payload.conversationId}
      replyPost={replyPost}
      jumpToId={jump ? jumpId : null}
      initial={{
        ...payload,
        messages: payload.messages.map(serializeMessage),
        // Without `changedSince` the payload has no changes to carry.
        changes: [],
      }}
    />
  );
};

export default CoachChatPage;

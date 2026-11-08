import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { ROUTES } from "@/constants/routes";
import { DmThread } from "@/features/social/components/DmThread";
import { resolveDmView } from "@/features/social/services/dm-access";
import { markDmConversationRead } from "@/features/social/services/dm-mutations";
import { listDmThread } from "@/features/social/services/dm-queries";
import { loadReplyPostFor } from "@/features/social/services/dm-reply-post";
import { loadPeople } from "@/features/social/services/friend-queries";
import { actorOfUser } from "@/features/social/services/post-context";
import { hasAcceptedTerms } from "@/features/social/services/terms";
import { parseDmId } from "@/features/social/utils/dm-rules";
import { requireUser } from "@/services/auth-guard";
import { readSearchParam } from "@/utils/search-params";

export const metadata: Metadata = { title: "Nhắn tin" };

// A chat with a friend. Anyone who is not one of the two members (or whose
// chat a block hid) gets a 404, the same as for an unknown id.
const DmPage = async ({
  params,
  searchParams,
}: PageProps<"/messages/dm/[conversationId]">) => {
  const user = await requireUser();

  if (!hasAcceptedTerms(user)) {
    redirect(ROUTES.FEED);
  }
  const id = parseDmId((await params).conversationId);
  const view = id === null ? null : await resolveDmView(id, actorOfUser(user));

  if (id === null || !view || view.otherId === null) {
    notFound();
  }
  const actor = actorOfUser(user);
  const replyPostId = parseDmId(
    readSearchParam((await searchParams).replyPost) ?? "",
  );
  const [thread, people, replyPost] = await Promise.all([
    listDmThread(id, { otherId: view.otherId, viewer: actor }),
    loadPeople([view.otherId]),
    replyPostId !== null && view.readOnlyReason === null
      ? loadReplyPostFor(actor, replyPostId, view.otherId)
      : null,
  ]);
  const other = people.get(view.otherId);

  if (!other) {
    notFound();
  }
  await markDmConversationRead(id, user.id);

  return (
    <DmThread
      conversationId={id}
      meId={user.id}
      other={other}
      replyPost={replyPost}
      initial={{
        ...thread,
        readOnlyReason: view.readOnlyReason,
        isReadOnly: view.readOnlyReason !== null,
      }}
    />
  );
};

export default DmPage;

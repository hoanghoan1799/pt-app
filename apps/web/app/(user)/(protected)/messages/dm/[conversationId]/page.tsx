import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { DmThread } from "@/features/social/components/DmThread";
import { listDmInbox, loadDmThread } from "@/features/social/services/dm-api";
import { parseDmId } from "@/features/social/utils/dm-rules";
import { tryApi } from "@/services/api/call";
import { requireUser } from "@/services/auth-guard";

export const generateMetadata = async (): Promise<Metadata> => {
  const t = await getTranslations("chat.pages");

  return { title: t("messagesTitle") };
};

// A chat with a friend, read-only. Anyone who is not one of the two members (or
// whose chat a block hid) gets a 404, the same as for an unknown id: the API
// answers it, and a trainee who has not accepted the terms is told so by it.
const DmPage = async ({
  params,
}: PageProps<"/messages/dm/[conversationId]">) => {
  const user = await requireUser();
  const id = parseDmId((await params).conversationId);
  const [thread, chats] = await Promise.all([
    id === null ? null : loadDmThread(id),
    id === null ? [] : listDmInbox(),
  ]);
  const other = chats.find((chat) => chat.conversationId === id);

  if (id === null || !thread || !other) {
    notFound();
  }
  await tryApi("user", (api) =>
    api.POST("/v1/dm/conversations/{cid}/read", {
      params: { path: { cid: id } },
      body: {} as never,
    }),
  );

  return (
    <DmThread
      conversationId={id}
      meId={user.id}
      other={{
        id: other.otherId,
        name: other.name,
        avatarUrl: other.avatarUrl,
      }}
      replyPost={null}
      initial={thread}
    />
  );
};

export default DmPage;

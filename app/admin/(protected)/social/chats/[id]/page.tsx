import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AppHeader } from "@/components/layout/AppHeader";
import { ROUTES } from "@/constants/routes";
import { BUTTON_SECONDARY, CARD, PAGE_CONTAINER } from "@/constants/styles";
import { DmBubbleList } from "@/features/social/components/DmBubbleList";
import { resolveDmView } from "@/features/social/services/dm-access";
import { loadDmMemberNames } from "@/features/social/services/dm-admin-queries";
import { listDmThread } from "@/features/social/services/dm-queries";
import { actorOfAdmin } from "@/features/social/services/post-context";
import { parseDmId } from "@/features/social/utils/dm-rules";
import { requireSuperAdmin } from "@/services/auth-guard";
import { readSearchParam } from "@/utils/search-params";

export const metadata: Metadata = { title: "Chat học viên" };

// Read-only thread for the super admin: no composer, no unsend, no read mark.
const AdminDmThreadPage = async ({
  params,
  searchParams,
}: PageProps<"/admin/social/chats/[id]">) => {
  const admin = await requireSuperAdmin();
  const id = parseDmId((await params).id);
  const view =
    id === null ? null : await resolveDmView(id, actorOfAdmin(admin));

  if (id === null || !view) {
    notFound();
  }
  const before = parseDmId(readSearchParam((await searchParams).before) ?? "");
  const [thread, names] = await Promise.all([
    listDmThread(id, {
      before: before ?? undefined,
      otherId: null,
      viewer: actorOfAdmin(admin),
    }),
    loadDmMemberNames(view.conversation.userLow, view.conversation.userHigh),
  ]);
  const oldest = thread.messages[0];

  return (
    <>
      <AppHeader
        eyebrow="Chỉ xem"
        title={`${names.get(view.conversation.userLow) ?? "Đã xoá"} · ${names.get(view.conversation.userHigh) ?? "Đã xoá"}`}
        backHref={ROUTES.ADMIN_SOCIAL_CHATS}
      />
      <main
        className={`${PAGE_CONTAINER} space-y-3 pt-4 pb-[calc(env(safe-area-inset-bottom)+2rem)]`}
      >
        {thread.hasMore && oldest && (
          <Link
            href={`${ROUTES.ADMIN_SOCIAL_CHATS}/${id}?before=${oldest.id}`}
            className={`${BUTTON_SECONDARY} w-full`}
          >
            Xem tin cũ hơn
          </Link>
        )}
        {thread.messages.length === 0 ? (
          <p className={`${CARD} p-6 text-center text-muted`}>
            Chưa có tin nhắn.
          </p>
        ) : (
          <DmBubbleList items={thread.messages} meId={null} names={names} />
        )}
      </main>
    </>
  );
};

export default AdminDmThreadPage;

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { AppHeader } from "@/components/layout/AppHeader";
import { ROUTES } from "@/constants/routes";
import { BUTTON_SECONDARY, CARD, PAGE_CONTAINER } from "@/constants/styles";
import { DmBubbleList } from "@/features/social/components/DmBubbleList";
import { loadAdminDmThread } from "@/features/social/services/dm-admin-queries";
import { parseDmId } from "@/features/social/utils/dm-rules";
import { requireSuperAdmin } from "@/services/auth-guard";
import { readSearchParam } from "@/utils/search-params";

export const generateMetadata = async (): Promise<Metadata> => {
  const t = await getTranslations("social.adminPages");

  return { title: t("chatsTitle") };
};

// Read-only thread for the super admin: no composer, no unsend, no read mark.
const AdminDmThreadPage = async ({
  params,
  searchParams,
}: PageProps<"/admin/social/chats/[id]">) => {
  const t = await getTranslations("social.adminPages");
  await requireSuperAdmin();
  const id = parseDmId((await params).id);
  const before = parseDmId(readSearchParam((await searchParams).before) ?? "");
  const view =
    id === null ? null : await loadAdminDmThread(id, before ?? undefined);

  if (id === null || !view) {
    notFound();
  }
  const { thread, names, memberIds } = view;
  const [low, high] = memberIds;
  const oldest = thread.messages[0];

  return (
    <>
      <AppHeader
        eyebrow={t("readOnly")}
        title={`${names.get(low) ?? t("deletedName")} · ${names.get(high) ?? t("deletedName")}`}
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
            {t("seeOlder")}
          </Link>
        )}
        {thread.messages.length === 0 ? (
          <p className={`${CARD} p-6 text-center text-muted`}>
            {t("noMessages")}
          </p>
        ) : (
          <DmBubbleList items={thread.messages} meId={null} names={names} />
        )}
      </main>
    </>
  );
};

export default AdminDmThreadPage;

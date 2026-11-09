import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";

import { AppHeader } from "@/components/layout/AppHeader";
import { ROUTES } from "@/constants/routes";
import { CARD, PAGE_CONTAINER, SECTION_TITLE } from "@/constants/styles";
import { TIME_ZONE } from "@/constants/time";
import { listAllDmConversations } from "@/features/social/services/dm-admin-queries";
import { requireSuperAdmin } from "@/services/auth-guard";
import { formatRelativeTime } from "@/utils/time";

export const generateMetadata = async (): Promise<Metadata> => {
  const t = await getTranslations("social.adminPages");

  return { title: t("chatsTitle") };
};

// Super admin only (spec Q6): every trainee-to-trainee chat, read-only.
const AdminDmChatsPage = async () => {
  const t = await getTranslations("social.adminPages");
  const locale = await getLocale();
  await requireSuperAdmin();

  const rows = await listAllDmConversations();

  return (
    <>
      <AppHeader
        eyebrow={t("eyebrow")}
        title={t("chatsTitle")}
        backHref={ROUTES.ADMIN_SOCIAL}
      />
      <main
        className={`${PAGE_CONTAINER} space-y-3 pt-4 pb-[calc(env(safe-area-inset-bottom)+2rem)]`}
      >
        <h2 className={SECTION_TITLE}>
          {t("chatsCount", { count: rows.length })}
        </h2>
        {rows.length === 0 ? (
          <p className={`${CARD} p-6 text-center text-muted`}>
            {t("chatsEmpty")}
          </p>
        ) : (
          <ul className="space-y-2">
            {rows.map((row) => (
              <li key={row.id}>
                <Link
                  href={`${ROUTES.ADMIN_SOCIAL_CHATS}/${row.id}`}
                  className={`${CARD} block space-y-1 p-3 active:bg-line/60`}
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate font-semibold text-fg">
                      {row.lowName} · {row.highName}
                    </span>
                    {row.lastMessageAt && (
                      <span className="shrink-0 text-xs text-muted">
                        {formatRelativeTime(
                          row.lastMessageAt.getTime(),
                          TIME_ZONE,
                          undefined,
                          locale,
                        )}
                      </span>
                    )}
                  </span>
                  <span className="block truncate text-sm text-muted">
                    {row.preview || t("preview")}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
};

export default AdminDmChatsPage;

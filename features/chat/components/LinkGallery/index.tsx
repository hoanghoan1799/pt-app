"use client";

import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { Avatar } from "@/components/common/Avatar";
import { CARD } from "@/constants/styles";
import { GalleryFooter } from "@/features/chat/components/GalleryFooter";
import { useGalleryPager } from "@/features/chat/hooks/use-gallery-pager";
import { jumpHref } from "@/features/chat/utils/chat-links";
import { type LinkPage, photoLabel } from "@/features/chat/utils/gallery-rules";

interface LinkGalleryProps {
  initial: LinkPage;
  endpoint: string;
  chatPath: string;
  avatars: Readonly<Record<string, string>>;
}

// Every link sent in the conversation, newest first, one row per URL: domain,
// the URL, who sent it and when. The row opens the URL in a new tab; the small
// button beside it jumps to the message.
export const LinkGallery = ({
  initial,
  endpoint,
  chatPath,
  avatars,
}: LinkGalleryProps) => {
  const t = useTranslations("chat.linkGallery");
  const { items, cursor, error, sentinel, loadMore } = useGalleryPager({
    initial,
    endpoint,
    tab: "links",
    keyOf: (item) => item.key,
  });

  if (items.length === 0) {
    return (
      <p className="px-6 py-16 text-center text-sm text-muted">{t("empty")}</p>
    );
  }

  return (
    <>
      <ul data-link-gallery className={`${CARD} mx-4 divide-y divide-line`}>
        {items.map((item) => (
          <li key={item.key} className="flex items-center gap-2 pr-3">
            <a
              href={item.href}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="flex min-w-0 flex-1 items-center gap-3 py-3 pl-4 transition active:bg-line/60"
            >
              <Avatar
                name={item.senderName}
                src={avatars[item.senderKey] ?? null}
                tone="soft"
                className="size-9 text-xs"
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1 font-semibold text-fg">
                  <span className="truncate">{item.domain}</span>
                  <ExternalLink
                    className="size-3.5 shrink-0 text-muted"
                    aria-hidden
                  />
                </span>
                <span className="block truncate text-sm text-accent">
                  {item.text}
                </span>
                <span className="block truncate text-xs text-muted">
                  {photoLabel(item)}
                </span>
              </span>
            </a>
            <Link
              href={jumpHref(chatPath, item.messageId)}
              className="shrink-0 rounded-lg border border-line px-2.5 py-1.5 text-xs font-semibold text-fg transition active:bg-line"
            >
              {t("showInChat")}
            </Link>
          </li>
        ))}
      </ul>
      <GalleryFooter
        sentinel={sentinel}
        cursor={cursor}
        error={error}
        onRetry={() => void loadMore()}
      />
    </>
  );
};

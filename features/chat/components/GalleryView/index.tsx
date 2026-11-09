import clsx from "clsx";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { LinkGallery } from "@/features/chat/components/LinkGallery";
import { PhotoGallery } from "@/features/chat/components/PhotoGallery";
import { StickerGallery } from "@/features/chat/components/StickerGallery";
import {
  GALLERY_TABS,
  type GalleryPage,
  type GalleryTab,
  type LinkPage,
  type StickerPage,
} from "@/features/chat/utils/gallery-rules";

interface GalleryViewProps {
  tab: GalleryTab;
  // The first page of `tab` only.
  page: GalleryPage | StickerPage | LinkPage;
  // The gallery page itself; tabs link to `${basePath}?tab=<tab>`.
  basePath: string;
  // Route that continues the list (`?tab=<tab>&before=<cursor>`).
  endpoint: string;
  chatPath: string;
  avatars: Readonly<Record<string, string>>;
}

// The gallery page body (KAN-160): the tab bar (state in the URL) over the
// photos, stickers or links of the conversation.
export const GalleryView = ({
  tab,
  page,
  basePath,
  endpoint,
  chatPath,
  avatars,
}: GalleryViewProps) => {
  const t = useTranslations("chat.gallery");

  return (
    <>
      <nav
        aria-label={t("tabsLabel")}
        className="mx-4 mb-3 flex gap-1 rounded-xl bg-line/60 p-1"
      >
        {GALLERY_TABS.map((item) => (
          <Link
            key={item}
            href={`${basePath}?tab=${item}`}
            replace
            scroll={false}
            aria-current={item === tab ? "page" : undefined}
            className={clsx(
              "flex min-h-10 flex-1 items-center justify-center rounded-lg text-sm font-semibold transition",
              item === tab ? "bg-surface text-fg shadow-sm" : "text-muted",
            )}
          >
            {t(`tabs.${item}`)}
          </Link>
        ))}
      </nav>
      {tab === "photos" ? (
        <PhotoGallery
          initial={page as GalleryPage}
          endpoint={endpoint}
          chatPath={chatPath}
          avatars={avatars}
        />
      ) : tab === "stickers" ? (
        <StickerGallery
          initial={page as StickerPage}
          endpoint={endpoint}
          chatPath={chatPath}
          avatars={avatars}
        />
      ) : (
        <LinkGallery
          initial={page as LinkPage}
          endpoint={endpoint}
          chatPath={chatPath}
          avatars={avatars}
        />
      )}
    </>
  );
};

import "server-only";

import { askApi, type Asked } from "@/features/chat/services/chat-api";
import { webizeUrls } from "@/features/chat/utils/api-urls";
import type {
  GalleryPage,
  GalleryTab,
  LinkPage,
  StickerPage,
} from "@/features/chat/utils/gallery-rules";
import { callApi } from "@/services/api/call";

// The gallery of a conversation (KAN-160): photos, stickers or links, newest
// first. The API owns access (own conversation, workspace, hidden trainees).

interface TabPages {
  photos: GalleryPage;
  stickers: StickerPage;
  links: LinkPage;
}

export type GalleryResult<T extends GalleryTab = "photos"> =
  { status: "ok"; page: TabPages[T] } | { status: "not_found" };

const EMPTY_PAGE = { items: [], nextCursor: null };

const query = (tab: GalleryTab, before: number | undefined) => ({
  tab,
  before,
});

// Raw page for route handlers.
export const askMyGallery = (
  tab: GalleryTab,
  before: number | undefined,
): Promise<Asked<unknown>> =>
  askApi("user", (api) =>
    api.GET("/v1/chat/conversations/me/gallery", {
      params: { query: query(tab, before) },
    }),
  );

export const askConversationGallery = (
  conversationId: number,
  tab: GalleryTab,
  before: number | undefined,
): Promise<Asked<unknown>> =>
  askApi("admin", (api) =>
    api.GET("/v1/chat/conversations/{cid}/gallery", {
      params: { path: { cid: conversationId }, query: query(tab, before) },
    }),
  );

// Trainee: only their own conversation. `hasConversation` false = nothing yet.
export const loadGalleryForTrainee = async <T extends GalleryTab = "photos">(
  hasConversation: boolean,
  before?: number,
  tab: T = "photos" as T,
  limit?: number,
): Promise<GalleryResult<T>> => {
  if (!hasConversation) {
    return { status: "ok", page: EMPTY_PAGE as TabPages[T] };
  }
  const page = webizeUrls(
    await callApi("user", (api) =>
      api.GET("/v1/chat/conversations/me/gallery", {
        params: { query: query(tab, before) },
      }),
    ),
  ) as unknown as TabPages[T];

  return { status: "ok", page: limit ? sliced(page, limit) : page };
};

// Admin: any conversation of a trainee this admin may access.
export const loadGalleryForAdmin = async <T extends GalleryTab = "photos">(
  conversationId: number,
  before?: number,
  tab: T = "photos" as T,
  limit?: number,
): Promise<GalleryResult<T>> => {
  const asked = await askConversationGallery(conversationId, tab, before);

  if (!asked.ok) {
    if (asked.error.status === 404) {
      return { status: "not_found" };
    }
    throw asked.error;
  }
  const page = webizeUrls(asked.data) as TabPages[T];

  return { status: "ok", page: limit ? sliced(page, limit) : page };
};

// The info page only shows a few tiles.
const sliced = <P extends { items: unknown[]; nextCursor: number | null }>(
  page: P,
  limit: number,
): P => ({ ...page, items: page.items.slice(0, limit) });

// Photos for the preview on the info pages.
export const listGalleryPhotos = async (
  conversationId: number | null,
  limit: number,
  asAdmin = false,
) => {
  if (conversationId === null) {
    return EMPTY_PAGE as GalleryPage;
  }
  const result = asAdmin
    ? await loadGalleryForAdmin(conversationId, undefined, "photos", limit)
    : await loadGalleryForTrainee(true, undefined, "photos", limit);

  return result.status === "ok" ? result.page : (EMPTY_PAGE as GalleryPage);
};

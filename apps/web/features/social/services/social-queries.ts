import "server-only";

import { cache } from "react";

import type {
  CommentView,
  NotificationView,
  PersonView,
  PostPage,
  PostView,
  ProfilePageData,
  ReportView,
  SearchResult,
} from "@/features/social/types/social";
import {
  toCommentView,
  toNotificationView,
  toPostView,
  toProfilePageData,
  toReportView,
  webAvatarUrl,
} from "@/features/social/utils/social-mappers";
import { callApi, tryApi } from "@/services/api/call";
import type { ApiActor } from "@/services/api/client";
import type { ApiError } from "@/services/api/errors";
import { DEFAULT_LOCALE, type Locale } from "@/utils/locale";

// Reads of the social area, all through the API (/v1/social). The API decides
// what the viewer may see; a missing, hidden or blocked thing is a 404, which
// these return as null so the page can call notFound().

type Who = Exclude<ApiActor, "none">;

const COMMENT_PAGE_LIMIT = 100;
// A post page never needs more than this many comment pages (1000 comments).
const COMMENT_MAX_PAGES = 10;

const isNotFound = (error: ApiError) => error.status === 404;

// Who the viewer is for the social area and whether the terms are accepted.
// One call per request.
export const getSocialMe = cache(async (who: Who) =>
  callApi(who, (api) => api.GET("/v1/social/me")),
);

export const getFeedPage = async (
  who: Who,
  cursor: string | null = null,
): Promise<PostPage> => {
  const page = await callApi(who, (api) =>
    api.GET("/v1/social/feed", {
      params: { query: cursor ? { cursor } : {} },
    }),
  );

  return { posts: page.items.map(toPostView), nextCursor: page.nextCursor };
};

// "profile" key as the API wants it: `user:12` / `admin:3`.
export const profileKey = (kind: "user" | "admin", id: number) =>
  `${kind}:${id}`;

export const getProfilePosts = async (
  who: Who,
  key: string,
  cursor: string | null = null,
): Promise<PostPage> => {
  const page = await callApi(who, (api) =>
    api.GET("/v1/social/profiles/{key}/posts", {
      params: { path: { key }, query: cursor ? { cursor } : {} },
    }),
  );

  return { posts: page.items.map(toPostView), nextCursor: page.nextCursor };
};

export const getProfile = async (
  who: Who,
  key: string,
): Promise<ProfilePageData | null> => {
  const outcome = await tryApi(who, (api) =>
    api.GET("/v1/social/profiles/{key}", { params: { path: { key } } }),
  );

  if (outcome.ok) {
    return toProfilePageData(outcome.data);
  }
  if (isNotFound(outcome.error)) {
    return null;
  }
  throw outcome.error;
};

export const getPostView = async (
  who: Who,
  postId: number,
): Promise<PostView | null> => {
  const outcome = await tryApi(who, (api) =>
    api.GET("/v1/social/posts/{id}", {
      params: { path: { id: String(postId) } },
    }),
  );

  if (outcome.ok) {
    return toPostView(outcome.data);
  }
  if (isNotFound(outcome.error)) {
    return null;
  }
  throw outcome.error;
};

// Oldest first. The API pages them; the post page shows them all, so the
// pages are followed (bounded).
export const listComments = async (
  who: Who,
  postId: number,
): Promise<CommentView[] | null> => {
  const comments: CommentView[] = [];
  let cursor: string | null = null;

  for (let page = 0; page < COMMENT_MAX_PAGES; page++) {
    const outcome = await tryApi(who, (api) =>
      api.GET("/v1/social/posts/{id}/comments", {
        params: {
          path: { id: String(postId) },
          query: {
            limit: COMMENT_PAGE_LIMIT,
            ...(cursor ? { cursor } : {}),
          },
        },
      }),
    );

    if (!outcome.ok) {
      if (isNotFound(outcome.error)) {
        return null;
      }
      throw outcome.error;
    }
    comments.push(
      ...outcome.data.items.map((item) => toCommentView(item, who)),
    );
    if (outcome.data.nextCursor === null) {
      break;
    }
    cursor = outcome.data.nextCursor;
  }
  return comments;
};

export interface NotificationsData {
  notifications: NotificationView[];
  unreadCount: number;
}

// The first page (latest 50), newest first. Reading does not mark them read:
// the page calls markNotificationsRead after it has the list.
export const listNotifications = async (
  who: Who,
  locale: Locale = DEFAULT_LOCALE,
): Promise<NotificationsData> => {
  const page = await callApi(who, (api) =>
    api.GET("/v1/social/notifications", {}),
  );

  return {
    notifications: page.items.map((item) =>
      toNotificationView(item, who, locale),
    ),
    unreadCount: page.unreadCount,
  };
};

export const markNotificationsRead = async (who: Who) => {
  await callApi(who, (api) => api.POST("/v1/social/notifications/read"));
};

const toPerson = (person: {
  id: number;
  name: string;
  avatarUrl: string | null;
}): PersonView => ({ ...person, avatarUrl: webAvatarUrl(person.avatarUrl) });

export const listFriends = async (): Promise<PersonView[]> =>
  (await callApi("user", (api) => api.GET("/v1/social/friends"))).items.map(
    toPerson,
  );

export const listBlockedByMe = async (): Promise<PersonView[]> =>
  (await callApi("user", (api) => api.GET("/v1/social/blocks"))).items.map(
    toPerson,
  );

export const listFriendRequests = async () => {
  const { received, sent } = await callApi("user", (api) =>
    api.GET("/v1/social/friends/requests"),
  );

  return { received: received.map(toPerson), sent: sent.map(toPerson) };
};

export const searchTraineeByEmail = async (
  email: string,
): Promise<SearchResult | null> => {
  const { result } = await callApi("user", (api) =>
    api.GET("/v1/social/people", { params: { query: { email } } }),
  );

  return result
    ? { ...toPerson(result), relationship: result.relationship }
    : null;
};

export interface ReportsData {
  reports: ReportView[];
  openCount: number;
}

// Super admin only (the API refuses everyone else).
export const listOpenReports = async (): Promise<ReportsData> => {
  const { items, openCount } = await callApi("admin", (api) =>
    api.GET("/v1/social/reports"),
  );

  return { reports: items.map(toReportView), openCount };
};

export const countOpenReports = async () => (await listOpenReports()).openCount;

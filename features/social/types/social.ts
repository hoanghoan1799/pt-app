export type AuthorKind = "user" | "admin";
export type PostPrivacy = "everyone" | "friends" | "only_me";
export type AdminRoleName = "super_admin" | "pt";

// Who is looking (or writing). `role` only matters for admins.
export type SocialActor =
  | { kind: "user"; id: number }
  | { kind: "admin"; id: number; role: AdminRoleName };

export interface PostAuthorRef {
  kind: AuthorKind;
  id: number;
}

export interface PostPhotoView {
  id: number;
  url: string;
  width: number;
  height: number;
}

export interface ReactionSummary {
  // Emoji with their counts, most used first.
  counts: { emoji: string; count: number }[];
  total: number;
  // The viewer's own reaction.
  mine: string | null;
}

export interface CommentView {
  id: number;
  authorName: string;
  authorAvatarUrl: string | null;
  authorVerified: boolean;
  authorHref: string;
  body: string;
  createdAt: number;
  edited: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

export interface ReactorView {
  name: string;
  emoji: string;
  isMe: boolean;
}

export type NotificationKind =
  "friend_request" | "friend_accepted" | "post_reaction" | "post_comment";

export interface NotificationView {
  id: number;
  kind: NotificationKind;
  text: string;
  href: string | null;
  actorName: string;
  actorAvatarUrl: string | null;
  createdAt: number;
  isUnread: boolean;
}

// What the UI needs to draw one post card. Plain data (no Date) so it can
// cross the server/client boundary.
export interface PostView {
  id: number;
  authorKind: AuthorKind;
  authorId: number;
  authorName: string;
  authorAvatarUrl: string | null;
  authorVerified: boolean;
  caption: string;
  privacy: PostPrivacy;
  photo: PostPhotoView | null;
  createdAt: number;
  edited: boolean;
  canEdit: boolean;
  canDelete: boolean;
  reactions: ReactionSummary;
  commentCount: number;
}

export interface PostPage {
  posts: PostView[];
  // Pass back to load the next page; null on the last page.
  nextCursor: number | null;
}

// Where a list of posts is read from.
export type PostSource =
  | { type: "feed" }
  | { type: "profile"; kind: AuthorKind; id: number }
  | { type: "admin-feed" };

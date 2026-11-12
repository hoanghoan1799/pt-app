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
  | "friend_request"
  | "friend_accepted"
  | "post_reaction"
  | "post_comment"
  | "admin_post";

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
  // The API's opaque cursor: pass it back to load the next page; null on the
  // last page.
  nextCursor: string | null;
}

export interface PersonView {
  id: number;
  name: string;
  avatarUrl: string | null;
}

export type FriendRelationship = "none" | "friends" | "sent" | "received";

export interface SearchResult extends PersonView {
  relationship: FriendRelationship;
}

export interface TrainingStats {
  workouts: number;
  streak: number;
  totalSets: number;
}

export interface ProfileData {
  kind: AuthorKind;
  id: number;
  // The viewer's private nickname for this person when they set one, else
  // the real name.
  name: string;
  // Always the real name; the profile page shows it next to a nickname.
  realName: string;
  // The nickname alone ("" when none), for the editor.
  alias: string;
  avatarUrl: string | null;
  verified: boolean;
  bio: string;
  // Trainee, or the admin's actual role.
  role: "trainee" | "pt" | "super_admin";
}

// One profile page: the card plus what the viewer may do with it.
export interface ProfilePageData {
  profile: ProfileData;
  isOwn: boolean;
  // Trainee viewer looking at another trainee: the friend button.
  relationship: FriendRelationship | null;
  friendCount: number | null;
  stats: TrainingStats | null;
  canBlock: boolean;
  canReport: boolean;
  composerPrivacy: PostPrivacy | null;
}

// Where a list of posts is read from.
export type PostSource =
  | { type: "feed" }
  | { type: "profile"; kind: AuthorKind; id: number }
  | { type: "admin-feed" };

export interface ReportView {
  id: number;
  targetKind: "post" | "comment" | "user";
  targetId: number;
  reporterName: string;
  reason: string;
  createdAt: number;
  // Short text of the reported content; null when it no longer exists.
  preview: string | null;
  // Whose content or account it is.
  targetName: string | null;
  // Where the super admin can look at it.
  href: string | null;
}

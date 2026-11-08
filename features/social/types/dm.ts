// The post a message replies to, computed for the viewer: when they may no
// longer see it (deleted, privacy changed, block) only the id is left.
export type DmReplyPostView =
  | { id: number; available: false }
  | {
      id: number;
      available: true;
      authorName: string;
      authorAvatarUrl: string | null;
      // The full caption; the compact composer bar clamps it with CSS.
      caption: string;
      photo: { url: string; width: number; height: number } | null;
    };

export interface DmMessageView {
  id: number;
  senderId: number;
  body: string | null;
  photo: { url: string; width: number; height: number } | null;
  post: DmReplyPostView | null;
  clientId: string;
  createdAt: string;
}

export interface DmThreadPage {
  messages: DmMessageView[];
  // Ids (among the latest rows) that were unsent: the client drops them.
  deletedIds: number[];
  hasMore: boolean;
  // The other member's read mark (for "Đã xem").
  otherReadUpTo: number;
}

export interface DmMessageView {
  id: number;
  senderId: number;
  body: string | null;
  photo: { url: string; width: number; height: number } | null;
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

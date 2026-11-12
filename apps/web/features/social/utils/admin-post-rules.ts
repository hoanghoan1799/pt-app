import type { PostPrivacy } from "@/features/social/types/social";

// A new admin post notifies the trainees who can see it. "Chỉ mình tôi"
// reaches nobody; every other privacy reaches the admin's trainees (admins are
// default friends of their trainees, see visibility.ts).
export const shouldNotifyAdminPost = (privacy: PostPrivacy): boolean =>
  privacy !== "only_me";

import type { SocialPostPrivacy } from "@pt/contracts";

// A new admin post notifies the trainees who can see it. "Chỉ mình tôi"
// reaches nobody; every other privacy reaches the admin's trainees (admins are
// default friends of their trainees).
export const shouldNotifyAdminPost = (privacy: SocialPostPrivacy): boolean =>
  privacy !== "only_me";

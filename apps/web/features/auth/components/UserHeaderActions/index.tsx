import { HeaderMenus } from "@/components/layout/HeaderMenus";
import { getOwnAvatarUrl } from "@/features/avatar/services/own-avatar";
import { profilePath } from "@/features/social/utils/post-rules";
import { requireUser } from "@/services/auth-guard";

// Trainee account actions shown in the app header: the gear menu (theme, push)
// and the avatar menu (profile, photo, change password, log out).
export const UserHeaderActions = async () => {
  const user = await requireUser();

  return (
    <HeaderMenus
      role="user"
      name={user.name}
      avatarUrl={await getOwnAvatarUrl("user")}
      profileHref={profilePath("user", user.id)}
    />
  );
};

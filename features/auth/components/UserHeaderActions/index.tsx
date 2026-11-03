import { KeyRound } from "lucide-react";
import Link from "next/link";

import { ROUTES } from "@/constants/routes";
import { ICON_BUTTON } from "@/constants/styles";
import { LogoutButton } from "@/features/auth/components/LogoutButton";

// Trainee account actions shown in the app header: change password, log out.
export const UserHeaderActions = () => (
  <>
    <Link
      href={ROUTES.ACCOUNT_PASSWORD}
      className={ICON_BUTTON}
      aria-label="Đổi mật khẩu"
      title="Đổi mật khẩu"
    >
      <KeyRound className="size-5" />
    </Link>
    <LogoutButton role="user" />
  </>
);

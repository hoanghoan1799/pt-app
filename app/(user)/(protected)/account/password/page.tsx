import type { Metadata } from "next";

import { AppHeader } from "@/components/layout/AppHeader";
import { ROUTES } from "@/constants/routes";
import { PAGE_CONTAINER } from "@/constants/styles";
import { ChangePasswordForm } from "@/features/auth/components/ChangePasswordForm";
import { requireUser } from "@/services/auth-guard";

export const metadata: Metadata = { title: "Đổi mật khẩu" };

const ChangePasswordPage = async () => {
  const user = await requireUser();

  return (
    <>
      <AppHeader
        eyebrow={user.email ?? user.name}
        title="Đổi mật khẩu"
        backHref={ROUTES.WORKOUTS}
      />
      <main
        className={`${PAGE_CONTAINER} space-y-4 pt-4 pb-[calc(env(safe-area-inset-bottom)+6rem)]`}
      >
        <ChangePasswordForm />
        <p className="text-sm text-muted">
          Quên mật khẩu hiện tại? Liên hệ PT của bạn để đặt lại.
        </p>
      </main>
    </>
  );
};

export default ChangePasswordPage;

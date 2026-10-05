import { ShieldCheck } from "lucide-react";
import type { Metadata } from "next";

import { CARD } from "@/constants/styles";
import { AdminLoginForm } from "@/features/auth/components/AdminLoginForm";

export const metadata: Metadata = { title: "Admin" };

// Signed-in admins (→ /admin) and users (→ /workouts) never reach this page;
// proxy.ts redirects them.
const AdminLoginPage = () => (
  <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 pt-[calc(env(safe-area-inset-top)+3rem)] pb-[calc(env(safe-area-inset-bottom)+3rem)]">
    <div className="mb-8 flex flex-col items-center text-center">
      <span className="flex size-16 items-center justify-center rounded-3xl bg-fg text-bg">
        <ShieldCheck className="size-8" aria-hidden />
      </span>
      <h1 className="mt-5 text-3xl font-bold tracking-tight text-fg">
        Khu vực PT
      </h1>
      <p className="mt-2 text-muted">Đăng nhập để quản lý user và bài tập</p>
    </div>
    <div className={`${CARD} p-5`}>
      <AdminLoginForm />
    </div>
  </main>
);

export default AdminLoginPage;

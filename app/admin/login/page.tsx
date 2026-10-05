import { ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { ROUTES } from "@/constants/routes";
import { CARD } from "@/constants/styles";
import { AdminLoginForm } from "@/features/auth/components/AdminLoginForm";
import { isAdmin } from "@/services/auth-guard";

export const metadata: Metadata = { title: "Admin" };

const AdminLoginPage = async () => {
  if (await isAdmin()) {
    redirect(ROUTES.ADMIN);
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pt-[calc(env(safe-area-inset-top)+3rem)] pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
      <div className="flex flex-1 flex-col justify-center">
        <div className="mb-8 flex flex-col items-center text-center">
          <span className="flex size-16 items-center justify-center rounded-3xl bg-fg text-bg">
            <ShieldCheck className="size-8" aria-hidden />
          </span>
          <h1 className="mt-5 text-3xl font-bold tracking-tight text-fg">
            Khu vực PT
          </h1>
          <p className="mt-2 text-muted">Quản lý user và giao bài tập</p>
        </div>
        <div className={`${CARD} p-5`}>
          <AdminLoginForm />
        </div>
      </div>
      <Link
        href={ROUTES.HOME}
        className="mx-auto mt-6 inline-flex min-h-11 items-center px-4 text-sm text-muted"
      >
        ← Về trang user
      </Link>
    </main>
  );
};

export default AdminLoginPage;

import { Dumbbell } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { ROUTES } from "@/constants/routes";
import { CARD } from "@/constants/styles";
import { UserLoginForm } from "@/features/auth/components/UserLoginForm";
import { getCurrentUser } from "@/services/auth-guard";

const HomePage = async () => {
  if (await getCurrentUser()) {
    redirect(ROUTES.WORKOUTS);
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pt-[calc(env(safe-area-inset-top)+3rem)] pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
      <div className="flex flex-1 flex-col justify-center">
        <div className="mb-8 flex flex-col items-center text-center">
          <span className="flex size-16 items-center justify-center rounded-3xl bg-accent text-accent-fg shadow-lg shadow-accent/30">
            <Dumbbell className="size-8" aria-hidden />
          </span>
          <h1 className="mt-5 text-3xl font-bold tracking-tight text-fg">
            PT App
          </h1>
          <p className="mt-2 text-muted">Nhập tên để xem lịch tập tuần này</p>
        </div>
        <div className={`${CARD} p-5`}>
          <UserLoginForm />
        </div>
      </div>
      <Link
        href={ROUTES.ADMIN_LOGIN}
        className="mx-auto mt-6 inline-flex min-h-11 items-center px-4 text-sm text-muted"
      >
        Dành cho PT / Admin
      </Link>
    </main>
  );
};

export default HomePage;

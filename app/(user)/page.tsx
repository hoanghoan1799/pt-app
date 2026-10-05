import { Dumbbell } from "lucide-react";

import { CARD } from "@/constants/styles";
import { UserLoginForm } from "@/features/auth/components/UserLoginForm";

// Signed-in users are redirected to their workouts by proxy.ts.
const HomePage = () => (
  <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 pt-[calc(env(safe-area-inset-top)+3rem)] pb-[calc(env(safe-area-inset-bottom)+3rem)]">
    <div className="mb-8 flex flex-col items-center text-center">
      <span className="flex size-16 items-center justify-center rounded-3xl bg-accent text-accent-fg shadow-lg shadow-accent/30">
        <Dumbbell className="size-8" aria-hidden />
      </span>
      <h1 className="mt-5 text-3xl font-bold tracking-tight text-fg">PT App</h1>
      <p className="mt-2 text-muted">Nhập tên để xem lịch tập tuần này</p>
    </div>
    <div className={`${CARD} p-5`}>
      <UserLoginForm />
    </div>
  </main>
);

export default HomePage;

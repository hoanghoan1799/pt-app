"use client";

import { Lock } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { ROUTES } from "@/constants/routes";
import { BUTTON_SECONDARY } from "@/constants/styles";
import { ForgotPasscodeSheet } from "@/features/auth/components/ForgotPasscodeSheet";
import { PasscodeKeypad } from "@/features/auth/components/PasscodeKeypad";
import { logoutAdminAction } from "@/features/auth/services/auth-actions";
import { verifyPasscode } from "@/features/auth/services/passcode-actions";
import {
  describePasscodeFailure,
  toPasscodeFailure,
} from "@/features/auth/utils/passcode-result";
import { PASSCODE_LENGTH } from "@/features/auth/utils/passcode-rules";

interface PasscodeLockProps {
  // Already validated on the server: a safe /admin path.
  nextPath: string;
}

const SIGNED_OUT_TOAST = "Đã đăng xuất vì nhập sai quá 5 lần";

export const PasscodeLock = ({ nextPath }: PasscodeLockProps) => {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isForgotOpen, setIsForgotOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const submit = (passcode: string) => {
    startTransition(async () => {
      const result = await verifyPasscode(passcode);

      if (result.status === "success") {
        router.replace(nextPath);
        return;
      }
      setValue("");
      const failure = toPasscodeFailure(result);

      if (failure.signedOut) {
        toast.error(SIGNED_OUT_TOAST);
        router.replace(ROUTES.ADMIN_LOGIN);
        return;
      }
      setError(describePasscodeFailure(failure));
    });
  };

  const onChange = (next: string) => {
    setValue(next);
    setError(null);
    if (next.length === PASSCODE_LENGTH) {
      submit(next);
    }
  };

  const logOut = () => {
    startTransition(() => {
      void logoutAdminAction();
    });
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col items-center px-4 pt-[calc(env(safe-area-inset-top)+3rem)] pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
      <span className="flex size-14 items-center justify-center rounded-full bg-accent/15 text-accent">
        <Lock className="size-7" aria-hidden />
      </span>
      <h1 className="mt-4 text-xl font-bold text-fg">Nhập mã khoá</h1>
      <p role="alert" className="mt-2 min-h-5 text-sm font-medium text-danger">
        {error}
      </p>
      <div className="mt-6">
        <PasscodeKeypad
          value={value}
          onChange={onChange}
          isDisabled={isPending}
          hasError={Boolean(error)}
          isKeyboardEnabled
        />
      </div>
      <div className="mt-auto flex w-full gap-3 pt-10">
        <button
          type="button"
          className={`${BUTTON_SECONDARY} flex-1`}
          onClick={() => setIsForgotOpen(true)}
        >
          Quên mã khoá
        </button>
        <button
          type="button"
          className={`${BUTTON_SECONDARY} flex-1`}
          onClick={logOut}
        >
          Đăng xuất
        </button>
      </div>
      <ForgotPasscodeSheet
        isOpen={isForgotOpen}
        onOpenChange={setIsForgotOpen}
        onReset={() => router.replace(nextPath)}
      />
    </main>
  );
};

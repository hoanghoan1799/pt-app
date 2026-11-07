"use client";

import { type FormEvent, useState, useTransition } from "react";
import { toast } from "sonner";

import { BottomSheet } from "@/components/common/BottomSheet";
import { BUTTON_PRIMARY, FIELD_ERROR, INPUT, LABEL } from "@/constants/styles";
import { AUTH_MESSAGES } from "@/features/auth/constants/messages";
import { resetPasscodeWithPassword } from "@/features/auth/services/passcode-actions";
import { isValidPasscode } from "@/features/auth/utils/passcode-rules";

interface ForgotPasscodeSheetProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onReset: () => void;
}

const PASSCODE_INPUT_PROPS = {
  type: "password",
  inputMode: "numeric",
  pattern: "\\d{4}",
  maxLength: 4,
  autoComplete: "off",
} as const;

// "Quên mã khoá": the account password proves it is the admin, then a new
// passcode replaces the forgotten one.
export const ForgotPasscodeSheet = ({
  isOpen,
  onOpenChange,
  onReset,
}: ForgotPasscodeSheetProps) => {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const password = String(data.get("password") ?? "");
    const newPasscode = String(data.get("newPasscode") ?? "");
    const confirm = String(data.get("confirmPasscode") ?? "");

    if (!isValidPasscode(newPasscode)) {
      setError(AUTH_MESSAGES.PASSCODE_INVALID);
      return;
    }
    if (newPasscode !== confirm) {
      setError("Mã khoá nhập lại không khớp");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await resetPasscodeWithPassword(password, newPasscode);

      if (result.status === "success") {
        toast.success("Đã đặt lại mã khoá");
        onReset();
        return;
      }
      setError(result.message);
    });
  };

  return (
    <BottomSheet
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title="Quên mã khoá"
      description="Nhập mật khẩu tài khoản để đặt mã khoá mới."
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label htmlFor="forgot-password" className={LABEL}>
            Mật khẩu tài khoản
          </label>
          <input
            id="forgot-password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className={INPUT}
          />
        </div>
        <div>
          <label htmlFor="forgot-new-passcode" className={LABEL}>
            Mã khoá mới (4 chữ số)
          </label>
          <input
            id="forgot-new-passcode"
            name="newPasscode"
            required
            className={INPUT}
            {...PASSCODE_INPUT_PROPS}
          />
        </div>
        <div>
          <label htmlFor="forgot-confirm-passcode" className={LABEL}>
            Nhập lại mã khoá mới
          </label>
          <input
            id="forgot-confirm-passcode"
            name="confirmPasscode"
            required
            className={INPUT}
            {...PASSCODE_INPUT_PROPS}
          />
          {error && (
            <p role="alert" className={FIELD_ERROR}>
              {error}
            </p>
          )}
        </div>
        <button
          type="submit"
          disabled={isPending}
          className={`${BUTTON_PRIMARY} w-full`}
        >
          {isPending ? "Đang lưu…" : "Đặt lại mã khoá"}
        </button>
      </form>
    </BottomSheet>
  );
};

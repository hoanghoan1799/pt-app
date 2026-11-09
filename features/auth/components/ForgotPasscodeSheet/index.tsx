"use client";

import { useTranslations } from "next-intl";
import { type FormEvent, useState, useTransition } from "react";
import { toast } from "sonner";

import { BottomSheet } from "@/components/common/BottomSheet";
import { SubmitButton } from "@/components/common/SubmitButton";
import { BUTTON_PRIMARY, FIELD_ERROR, INPUT, LABEL } from "@/constants/styles";
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
  const t = useTranslations("auth.forgotPasscode");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const password = String(data.get("password") ?? "");
    const newPasscode = String(data.get("newPasscode") ?? "");
    const confirm = String(data.get("confirmPasscode") ?? "");

    if (!isValidPasscode(newPasscode)) {
      setError(t("passcodeInvalid"));
      return;
    }
    if (newPasscode !== confirm) {
      setError(t("passcodeMismatch"));
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await resetPasscodeWithPassword(password, newPasscode);

      if (result.status === "success") {
        toast.success(t("resetSuccess"));
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
      title={t("title")}
      description={t("description")}
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label htmlFor="forgot-password" className={LABEL}>
            {t("accountPasswordLabel")}
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
            {t("newPasscodeLabel")}
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
            {t("confirmPasscodeLabel")}
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
        <SubmitButton
          isPending={isPending}
          className={`${BUTTON_PRIMARY} w-full`}
        >
          {isPending ? t("saving") : t("submit")}
        </SubmitButton>
      </form>
    </BottomSheet>
  );
};

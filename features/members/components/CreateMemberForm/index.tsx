"use client";

import { UserPlus } from "lucide-react";

import { SubmitButton } from "@/components/common/SubmitButton";
import { BUTTON_PRIMARY, FIELD_ERROR, INPUT } from "@/constants/styles";
import { OneTimePassword } from "@/features/members/components/OneTimePassword";
import { useCreateMember } from "@/features/members/hooks/use-create-member";

interface CreateMemberFormProps {
  // Called when the admin dismisses the one-time password panel.
  onDone?: () => void;
}

export const CreateMemberForm = ({ onDone }: CreateMemberFormProps) => {
  const {
    formAction,
    nameError,
    emailError,
    defaultName,
    defaultEmail,
    credentials,
    dismissPassword,
  } = useCreateMember(onDone);

  if (credentials) {
    return <OneTimePassword {...credentials} onDone={dismissPassword} />;
  }

  return (
    <form action={formAction} className="space-y-3">
      <div>
        <label htmlFor="member-name" className="sr-only">
          Tên user mới
        </label>
        <input
          key={defaultName}
          id="member-name"
          name="name"
          defaultValue={defaultName}
          placeholder="Tên user mới"
          autoCapitalize="words"
          autoCorrect="off"
          enterKeyHint="next"
          required
          aria-invalid={Boolean(nameError)}
          className={INPUT}
        />
        {nameError && (
          <p role="alert" className={FIELD_ERROR}>
            {nameError}
          </p>
        )}
      </div>
      <div>
        <label htmlFor="member-email" className="sr-only">
          Email đăng nhập
        </label>
        <input
          key={defaultEmail}
          id="member-email"
          name="email"
          type="email"
          inputMode="email"
          defaultValue={defaultEmail}
          placeholder="Email đăng nhập"
          autoCapitalize="none"
          autoComplete="off"
          autoCorrect="off"
          enterKeyHint="done"
          required
          aria-invalid={Boolean(emailError)}
          className={INPUT}
        />
        {emailError && (
          <p role="alert" className={FIELD_ERROR}>
            {emailError}
          </p>
        )}
      </div>
      <SubmitButton className={`${BUTTON_PRIMARY} w-full`}>
        <UserPlus className="size-5" aria-hidden />
        Thêm
      </SubmitButton>
    </form>
  );
};

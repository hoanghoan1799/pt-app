"use client";

import { UserPlus } from "lucide-react";

import { SubmitButton } from "@/components/common/SubmitButton";
import { BUTTON_PRIMARY, FIELD_ERROR, INPUT, LABEL } from "@/constants/styles";
import { OneTimePassword } from "@/features/members/components/OneTimePassword";
import { useCreateMember } from "@/features/members/hooks/use-create-member";

interface CreateMemberFormProps {
  // Set for a super admin: the "PT phụ trách" choices. A PT's trainees always
  // join their own workspace, so no select is shown.
  ptOptions?: { id: number; username: string }[];
  // Called when the admin dismisses the one-time password panel.
  onDone?: () => void;
}

export const CreateMemberForm = ({
  ptOptions,
  onDone,
}: CreateMemberFormProps) => {
  const {
    formAction,
    nameError,
    emailError,
    ptError,
    defaultName,
    defaultEmail,
    credentials,
    dismissPassword,
  } = useCreateMember(onDone);

  if (credentials) {
    return <OneTimePassword {...credentials} onDone={dismissPassword} />;
  }

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label htmlFor="member-name" className={LABEL}>
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
        <label htmlFor="member-email" className={LABEL}>
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
      {ptOptions && (
        <div>
          <label htmlFor="member-pt" className={LABEL}>
            PT phụ trách
          </label>
          <select
            id="member-pt"
            name="ptAdminId"
            defaultValue=""
            aria-invalid={Boolean(ptError)}
            className={INPUT}
          >
            <option value="">Chưa giao (chỉ super admin)</option>
            {ptOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.username}
              </option>
            ))}
          </select>
          {ptError && (
            <p role="alert" className={FIELD_ERROR}>
              {ptError}
            </p>
          )}
        </div>
      )}
      {/* Pinned to the sheet's bottom edge so it stays reachable while the
          keyboard is up; the negative margin cancels the sheet's own padding. */}
      <div className="sticky bottom-0 -mb-[calc(env(safe-area-inset-bottom)+1.25rem)] bg-bg pt-2 pb-[calc(env(safe-area-inset-bottom)+1.25rem)]">
        <SubmitButton className={`${BUTTON_PRIMARY} w-full`}>
          <UserPlus className="size-5" aria-hidden />
          Thêm
        </SubmitButton>
      </div>
    </form>
  );
};

"use client";

import { UserPlus } from "lucide-react";

import { SubmitButton } from "@/components/common/SubmitButton";
import { BUTTON_PRIMARY, FIELD_ERROR, INPUT } from "@/constants/styles";
import { useCreateMember } from "@/features/members/hooks/use-create-member";

export const CreateMemberForm = () => {
  const { formAction, errorMessage, defaultName } = useCreateMember();

  return (
    <form action={formAction}>
      <label htmlFor="member-name" className="sr-only">
        Tên user mới
      </label>
      <div className="flex gap-2">
        <input
          key={defaultName}
          id="member-name"
          name="name"
          defaultValue={defaultName}
          placeholder="Tên user mới"
          autoCapitalize="words"
          autoCorrect="off"
          enterKeyHint="done"
          required
          aria-invalid={Boolean(errorMessage)}
          className={INPUT}
        />
        <SubmitButton className={`${BUTTON_PRIMARY} shrink-0 px-4`}>
          <UserPlus className="size-5" aria-hidden />
          Thêm
        </SubmitButton>
      </div>
      {errorMessage && (
        <p role="alert" className={FIELD_ERROR}>
          {errorMessage}
        </p>
      )}
    </form>
  );
};

"use client";

import { UserPlus } from "lucide-react";
import { useState } from "react";

import { BottomSheet } from "@/components/common/BottomSheet";
import { ICON_BUTTON } from "@/constants/styles";
import { CreateMemberForm } from "@/features/members/components/CreateMemberForm";

// A plain open/closed toggle, so no separate hook/view.
export const AddMemberButton = () => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className={`${ICON_BUTTON} text-fg`}
        aria-label="Thêm user"
      >
        <UserPlus className="size-5" />
      </button>
      <BottomSheet
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        title="Thêm user"
        description="User chỉ cần nhập đúng tên này để vào xem bài tập."
      >
        <CreateMemberForm onCreated={() => setIsOpen(false)} />
      </BottomSheet>
    </>
  );
};

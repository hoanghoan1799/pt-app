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
        description="Nhập email để tạo tài khoản. Mật khẩu được tạo tự động và chỉ hiện một lần."
      >
        <CreateMemberForm onDone={() => setIsOpen(false)} />
      </BottomSheet>
    </>
  );
};

"use client";

import { UserPlus } from "lucide-react";
import { useState } from "react";

import { BottomSheet } from "@/components/common/BottomSheet";
import { CreateMemberForm } from "@/features/members/components/CreateMemberForm";

interface AddMemberButtonProps {
  // Tile classes from the dashboard so it sits next to the link tiles.
  className?: string;
}

// A plain open/closed toggle, so no separate hook/view.
export const AddMemberButton = ({ className }: AddMemberButtonProps) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className={className}
      >
        <UserPlus className="size-6 text-accent" aria-hidden />
        <span>Thêm user</span>
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

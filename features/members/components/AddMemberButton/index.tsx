"use client";

import { UserPlus } from "lucide-react";
import { useState } from "react";

import { BottomSheet } from "@/components/common/BottomSheet";
import { CreateMemberForm } from "@/features/members/components/CreateMemberForm";

interface AddMemberButtonProps {
  // Tile classes from the dashboard so it sits next to the link tiles.
  className?: string;
  // PT accounts a super admin may assign the trainee to; omitted for a PT.
  ptOptions?: { id: number; username: string }[];
}

// A plain open/closed toggle, so no separate hook/view.
export const AddMemberButton = ({
  className,
  ptOptions,
}: AddMemberButtonProps) => {
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
        <CreateMemberForm
          ptOptions={ptOptions}
          onDone={() => setIsOpen(false)}
        />
      </BottomSheet>
    </>
  );
};

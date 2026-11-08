"use client";

import { useRouter } from "next/navigation";

import { BottomSheet } from "@/components/common/BottomSheet";
import { AvatarField } from "@/features/avatar/components/AvatarField";

interface AvatarSheetProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  role: "user" | "admin";
  name: string;
  savedUrl: string | null;
}

// Own profile photo from the avatar menu. After a save the server pages
// re-render, so the header avatar and the chat photos pick up the new URL.
export const AvatarSheet = ({
  isOpen,
  onOpenChange,
  role,
  name,
  savedUrl,
}: AvatarSheetProps) => {
  const router = useRouter();

  return (
    <BottomSheet
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title="Ảnh đại diện"
      description="Ảnh hiện ở đầu cuộc trò chuyện và cạnh tin nhắn của bạn."
    >
      <AvatarField
        role={role}
        name={name}
        savedUrl={savedUrl}
        onSaved={() => router.refresh()}
      />
    </BottomSheet>
  );
};

"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

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
  const t = useTranslations("avatar.sheet");
  const router = useRouter();

  return (
    <BottomSheet
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title={t("title")}
      description={t("description")}
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

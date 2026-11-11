"use client";

import { Camera } from "lucide-react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Avatar } from "@/components/common/Avatar";
import { IconButton } from "@/components/common/IconButton";
import { useHasOpened } from "@/hooks/use-has-opened";

// Overlay: loads on first open, like in the header menu.
const AvatarSheet = dynamic(
  () =>
    import("@/features/avatar/components/AvatarSheet").then(
      (module) => module.AvatarSheet,
    ),
  { ssr: false },
);

interface ProfileAvatarProps {
  name: string;
  src: string | null;
  mode: "user" | "admin";
  // Own profile: a camera button opens the existing avatar sheet.
  isOwn: boolean;
}

export const ProfileAvatar = ({
  name,
  src,
  mode,
  isOwn,
}: ProfileAvatarProps) => {
  const t = useTranslations("social.profile");
  const [isOpen, setIsOpen] = useState(false);
  const hasOpened = useHasOpened(isOpen);

  return (
    <div className="relative size-[88px] shrink-0">
      <Avatar name={name} src={src} className="size-full text-3xl" />
      {isOwn && (
        <>
          <IconButton
            label={t("changeAvatar")}
            size="sm"
            onClick={() => setIsOpen(true)}
            className="absolute -right-0.5 -bottom-0.5 size-8 rounded-full border-2 border-bg bg-surface text-fg"
          >
            <Camera className="size-4" aria-hidden />
          </IconButton>
          {hasOpened && (
            <AvatarSheet
              isOpen={isOpen}
              onOpenChange={setIsOpen}
              role={mode}
              name={name}
              savedUrl={src}
            />
          )}
        </>
      )}
    </div>
  );
};

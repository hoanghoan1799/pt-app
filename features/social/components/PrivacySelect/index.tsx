import { Globe, Lock, type LucideIcon, Users } from "lucide-react";
import { useTranslations } from "next-intl";

import { INPUT } from "@/constants/styles";
import { POST_PRIVACIES } from "@/features/social/constants/social";
import type { PostPrivacy } from "@/features/social/types/social";

export const PRIVACY_ICONS: Record<PostPrivacy, LucideIcon> = {
  everyone: Globe,
  friends: Users,
  only_me: Lock,
};

interface PrivacySelectProps {
  id: string;
  value: PostPrivacy;
  onChange: (value: PostPrivacy) => void;
  disabled?: boolean;
}

export const PrivacySelect = ({
  id,
  value,
  onChange,
  disabled,
}: PrivacySelectProps) => {
  const t = useTranslations("social");

  return (
    <select
      id={id}
      aria-label={t("privacy.label")}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value as PostPrivacy)}
      className={`${INPUT} min-h-11 w-auto py-0 text-sm`}
    >
      {POST_PRIVACIES.map((privacy) => (
        <option key={privacy} value={privacy}>
          {t(`privacy.${privacy}`)}
        </option>
      ))}
    </select>
  );
};

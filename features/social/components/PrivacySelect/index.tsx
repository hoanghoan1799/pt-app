import { Globe, Lock, type LucideIcon, Users } from "lucide-react";

import { INPUT } from "@/constants/styles";
import {
  POST_PRIVACIES,
  PRIVACY_LABELS,
} from "@/features/social/constants/social";
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
}: PrivacySelectProps) => (
  <select
    id={id}
    aria-label="Quyền riêng tư"
    value={value}
    disabled={disabled}
    onChange={(event) => onChange(event.target.value as PostPrivacy)}
    className={`${INPUT} min-h-11 w-auto py-0 text-sm`}
  >
    {POST_PRIVACIES.map((privacy) => (
      <option key={privacy} value={privacy}>
        {PRIVACY_LABELS[privacy]}
      </option>
    ))}
  </select>
);

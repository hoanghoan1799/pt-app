"use client";

import type { GroupSystemEvent } from "@pt/contracts";
import { useTranslations } from "next-intl";

import { PtChangeAlertLine } from "@/features/chat-groups/components/PtChangeAlertLine";
import {
  showsAlertButtons,
  systemLineOf,
} from "@/features/chat-groups/utils/group-display";

interface GroupSystemLineProps {
  groupId: number;
  messageId: number | null;
  event: GroupSystemEvent | null;
  eventNames: Readonly<Record<string, string | null>>;
  // Only a super admin gets Keep / Remove on an open alert.
  canResolveAlert: boolean;
  onChanged: () => void;
}

// A grey, centred line (no bubble) worded from the event in the reader's
// language. An open PT-change alert becomes a card with buttons for super
// admins; once resolved it is a plain line saying what was chosen.
export const GroupSystemLine = ({
  groupId,
  messageId,
  event,
  eventNames,
  canResolveAlert,
  onChanged,
}: GroupSystemLineProps) => {
  const t = useTranslations("chatGroups");
  const line = systemLineOf(event, eventNames, {
    deletedMember: t("thread.deletedMember"),
    noPt: t("alert.noPt"),
  });
  // Keys come from systemLineOf, always under "systemLine.".
  const text = t(line.key as "systemLine.unknown", line.params);

  if (messageId !== null && showsAlertButtons(event, canResolveAlert)) {
    return (
      <PtChangeAlertLine
        groupId={groupId}
        messageId={messageId}
        text={text}
        onChanged={onChanged}
      />
    );
  }
  return (
    <p className="mx-4 mt-3 mb-1 text-center text-xs text-muted">{text}</p>
  );
};

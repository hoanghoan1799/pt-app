"use client";

import clsx from "clsx";
import { Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useMemo, useState } from "react";

import { Avatar } from "@/components/common/Avatar";
import { Input } from "@/components/common/Input";
import { CARD, SECTION_TITLE } from "@/constants/styles";
import type { GroupCandidate } from "@/features/chat-groups/types/group";
import { filterCandidates } from "@/features/chat-groups/utils/group-display";

interface MemberPickerProps {
  trainees: GroupCandidate[];
  // PTs: only a super admin is offered any.
  pts: GroupCandidate[];
  selected: ReadonlySet<string>;
  onToggle: (key: string) => void;
  // How many more can be chosen (the group's free places).
  max: number;
}

const CandidateList = ({
  title,
  items,
  selected,
  onToggle,
  isFull,
}: {
  title: string;
  items: GroupCandidate[];
  selected: ReadonlySet<string>;
  onToggle: (key: string) => void;
  isFull: boolean;
}) =>
  items.length === 0 ? null : (
    <section className="space-y-2">
      <h3 className={SECTION_TITLE}>{title}</h3>
      <ul className={`${CARD} divide-y divide-line overflow-hidden`}>
        {items.map((item) => {
          const isChecked = selected.has(item.key);

          return (
            <li key={item.key}>
              <label
                className={clsx(
                  "flex min-h-12 cursor-pointer items-center gap-3 px-4 py-2 transition active:bg-line",
                  !isChecked && isFull && "cursor-not-allowed opacity-50",
                )}
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  disabled={!isChecked && isFull}
                  onChange={() => onToggle(item.key)}
                  className="size-5 shrink-0 accent-accent"
                />
                <Avatar
                  name={item.name}
                  tone="soft"
                  className="size-8 text-xs"
                />
                <span className="truncate font-medium text-fg">
                  {item.name}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </section>
  );

// The member picker of the create and add screens: a search box, trainees and
// (for a super admin) PTs as checkboxes, capped at the group's free places.
// The list the server hands over is already scoped (a PT sees own trainees);
// the add action checks the same rule again.
export const MemberPicker = ({
  trainees,
  pts,
  selected,
  onToggle,
  max,
}: MemberPickerProps) => {
  const t = useTranslations("chatGroups.create");
  const [query, setQuery] = useState("");
  const countId = useId();
  const shownTrainees = useMemo(
    () => filterCandidates(trainees, query),
    [trainees, query],
  );
  const shownPts = useMemo(() => filterCandidates(pts, query), [pts, query]);
  const isFull = selected.size >= max;
  const hasAny = trainees.length + pts.length > 0;

  if (!hasAny) {
    return (
      <p className="py-6 text-center text-sm text-muted">{t("noCandidates")}</p>
    );
  }
  return (
    <div className="space-y-4">
      <Input
        type="search"
        clearable
        leadingIcon={<Search className="size-4" aria-hidden />}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={t("search")}
        aria-label={t("search")}
        autoComplete="off"
        enterKeyHint="search"
      />
      <p id={countId} role="status" className="text-sm text-muted">
        {t("selected", { count: selected.size, max })}
      </p>
      {shownTrainees.length + shownPts.length === 0 && (
        <p className="py-4 text-center text-sm text-muted">{t("noMatches")}</p>
      )}
      <CandidateList
        title={t("trainees")}
        items={shownTrainees}
        selected={selected}
        onToggle={onToggle}
        isFull={isFull}
      />
      <CandidateList
        title={t("pts")}
        items={shownPts}
        selected={selected}
        onToggle={onToggle}
        isFull={isFull}
      />
    </div>
  );
};

"use client";

import { Loader2, Search } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { type FormEvent, useState, useTransition } from "react";
import { toast } from "sonner";

import { Avatar } from "@/components/common/Avatar";
import { BUTTON_PRIMARY, CARD, INPUT, LABEL } from "@/constants/styles";
import { RelationshipButton } from "@/features/social/components/RelationshipButton";
import { searchFriendAction } from "@/features/social/services/friend-actions";
import type { SearchResult } from "@/features/social/services/friend-queries";
import { profilePath } from "@/features/social/utils/post-rules";
import { describeErrorReference } from "@/utils/errors";

// "Tìm bạn bằng email": the whole address only, so nobody can browse emails.
export const FriendSearch = () => {
  const t = useTranslations("social.friendSearch");
  const [email, setEmail] = useState("");
  const [result, setResult] = useState<SearchResult | null>(null);
  const [isSearched, setSearched] = useState(false);
  const [isPending, startTransition] = useTransition();

  const search = () => {
    startTransition(async () => {
      const response = await searchFriendAction(email);

      if (response.status === "error") {
        toast.error(response.message, {
          description: describeErrorReference(response.reference),
        });
        return;
      }
      setResult(response.status === "success" ? response.result : null);
      setSearched(true);
    });
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    search();
  };

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label htmlFor="friend-email" className={LABEL}>
            {t("label")}
          </label>
          <input
            id="friend-email"
            type="email"
            inputMode="email"
            autoComplete="off"
            autoCapitalize="none"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              setSearched(false);
            }}
            placeholder="ten@example.com"
            className={INPUT}
          />
          <p className="mt-1.5 text-sm text-muted">{t("hint")}</p>
        </div>
        <button
          type="submit"
          disabled={isPending || email.trim() === ""}
          className={`${BUTTON_PRIMARY} w-full`}
        >
          {isPending ? (
            <Loader2 className="size-5 animate-spin" aria-hidden />
          ) : (
            <Search className="size-5" aria-hidden />
          )}
          {t("submit")}
        </button>
      </form>
      {isSearched &&
        (result ? (
          <div className={`${CARD} flex flex-wrap items-center gap-3 p-3`}>
            <Link
              href={profilePath("user", result.id)}
              className="flex min-w-0 flex-1 items-center gap-3"
            >
              <Avatar
                name={result.name}
                src={result.avatarUrl}
                className="size-11 shrink-0 text-sm"
              />
              <span className="min-w-0 flex-1 truncate font-semibold text-fg">
                {result.name}
              </span>
            </Link>
            {result.relationship !== "self" && (
              <RelationshipButton
                userId={result.id}
                name={result.name}
                relationship={result.relationship}
                onChanged={search}
              />
            )}
          </div>
        ) : (
          <p className={`${CARD} p-4 text-center text-muted`}>{t("empty")}</p>
        ))}
    </div>
  );
};

"use client";

import clsx from "clsx";
import { ChevronLeft, Search } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { ICON_BUTTON, INPUT, PAGE_CONTAINER } from "@/constants/styles";
import { type ChatPaths, jumpHref } from "@/features/chat/utils/chat-links";
import {
  formatResultTime,
  isSearchableQuery,
  SEARCH_MAX_LENGTH,
  SEARCH_MIN_LENGTH,
  type SearchPage,
  type SearchResult,
  searchSenderLabel,
} from "@/features/chat/utils/search-rules";

interface ChatSearchProps {
  viewer:
    | { role: "user" }
    | { role: "admin"; adminId: number; peerName: string | null };
  // Route of the search (`?q=<text>&before=<cursor>`).
  endpoint: string;
  paths: ChatPaths;
  nicknames: Readonly<Record<string, string>>;
}

const DEBOUNCE_MS = 300;

const isSearchPage = (value: unknown): value is SearchPage =>
  typeof value === "object" &&
  value !== null &&
  Array.isArray((value as SearchPage).results);

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error" }
  | {
      kind: "done";
      query: string;
      results: SearchResult[];
      nextCursor: number | null;
    };

// Search inside the open conversation (KAN-160, S1 and S2). Two characters or
// more; accents do not matter. Each result shows who wrote it, the text
// around the match with the match in bold, and when; a tap opens the chat at
// that message.
export const ChatSearch = ({
  viewer,
  endpoint,
  paths,
  nicknames,
}: ChatSearchProps) => {
  const [text, setText] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  // The newest request wins; an older answer is dropped.
  const requestId = useRef(0);
  const [now] = useState(() => Date.now());

  useEffect(() => {
    const query = text.trim();

    requestId.current += 1;
    if (!isSearchableQuery(query)) {
      // Nothing to look up; the view below shows the hint.
      return;
    }
    const id = requestId.current;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setState({ kind: "loading" });
      try {
        const response = await fetch(
          `${endpoint}?${new URLSearchParams({ q: query })}`,
          { cache: "no-store", signal: controller.signal },
        );
        const data: unknown = response.ok ? await response.json() : null;

        if (id !== requestId.current) {
          return;
        }
        setState(
          isSearchPage(data)
            ? {
                kind: "done",
                query,
                results: data.results,
                nextCursor: data.nextCursor,
              }
            : { kind: "error" },
        );
      } catch {
        if (id === requestId.current) {
          setState({ kind: "error" });
        }
      }
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [text, endpoint]);

  const loadMore = async () => {
    if (state.kind !== "done" || state.nextCursor === null || isLoadingMore) {
      return;
    }
    const { query, nextCursor } = state;
    const id = requestId.current;

    setIsLoadingMore(true);
    try {
      const response = await fetch(
        `${endpoint}?${new URLSearchParams({ q: query, before: String(nextCursor) })}`,
        { cache: "no-store" },
      );
      const data: unknown = response.ok ? await response.json() : null;

      if (id !== requestId.current || !isSearchPage(data)) {
        return;
      }
      setState({
        kind: "done",
        query,
        results: [
          ...state.results,
          ...data.results.filter(
            (result) =>
              !state.results.some(
                (known) => known.messageId === result.messageId,
              ),
          ),
        ],
        nextCursor: data.nextCursor,
      });
    } catch {
      // The button stays; the user can tap again.
    } finally {
      setIsLoadingMore(false);
    }
  };

  const t = useTranslations("chat.chatSearch");
  const query = text.trim();
  const isSearchable = isSearchableQuery(query);

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-line bg-bg/85 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
        <div
          className={clsx(PAGE_CONTAINER, "flex min-h-14 items-center gap-1")}
        >
          <Link
            href={paths.info}
            className={clsx(ICON_BUTTON, "-ml-3")}
            aria-label={t("back")}
          >
            <ChevronLeft className="size-6" />
          </Link>
          <div className="relative min-w-0 flex-1 py-2">
            <Search
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted"
            />
            <input
              type="search"
              value={text}
              onChange={(event) => setText(event.target.value)}
              maxLength={SEARCH_MAX_LENGTH}
              placeholder={t("placeholder")}
              aria-label={t("inputLabel")}
              autoComplete="off"
              enterKeyHint="search"

              autoFocus
              className={clsx(INPUT, "min-h-11 pl-10")}
            />
          </div>
        </div>
      </header>
      <main data-chat-search className={clsx(PAGE_CONTAINER, "pt-2 pb-12")}>
        {!isSearchable && (
          <p className="px-6 py-16 text-center text-sm text-muted">
            {t("minLength", { min: SEARCH_MIN_LENGTH })}
          </p>
        )}
        {isSearchable && state.kind === "loading" && (
          <p
            role="status"
            className="px-6 py-16 text-center text-sm text-muted"
          >
            {t("searching")}
          </p>
        )}
        {isSearchable && state.kind === "error" && (
          <p
            role="alert"
            className="px-6 py-16 text-center text-sm text-danger"
          >
            {t("failed")}
          </p>
        )}
        {isSearchable &&
          state.kind === "done" &&
          state.query === query &&
          (state.results.length === 0 ? (
            <p className="px-6 py-16 text-center text-sm text-muted">
              {t("empty")}
            </p>
          ) : (
            <>
              <ul data-search-results className="divide-y divide-line">
                {state.results.map((result) => (
                  <li key={result.messageId}>
                    <Link
                      href={jumpHref(paths.chat, result.messageId)}
                      data-search-result={result.messageId}
                      className="block rounded-xl px-2 py-3 transition active:bg-line"
                    >
                      <span className="flex items-baseline justify-between gap-3">
                        <span className="truncate text-sm font-semibold text-fg">
                          {searchSenderLabel(result, viewer, nicknames)}
                        </span>
                        <span className="shrink-0 text-xs text-muted">
                          {formatResultTime(result.createdAt, now)}
                        </span>
                      </span>
                      <span className="mt-0.5 block text-sm break-words text-muted">
                        {result.snippet.before}
                        <strong className="font-bold text-fg">
                          {result.snippet.match}
                        </strong>
                        {result.snippet.after}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              {state.nextCursor !== null && (
                <div className="flex justify-center py-4">
                  <button
                    type="button"
                    onClick={() => void loadMore()}
                    disabled={isLoadingMore}
                    className="rounded-full border border-line bg-surface px-4 py-2 text-sm font-medium text-muted transition active:bg-line disabled:opacity-50"
                  >
                    {isLoadingMore ? t("searching") : t("loadMore")}
                  </button>
                </div>
              )}
            </>
          ))}
      </main>
    </>
  );
};

"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { BUTTON_PRIMARY, BUTTON_SECONDARY, CARD } from "@/constants/styles";
import { MEMBER_MESSAGES } from "@/features/members/constants/messages";

interface OneTimePasswordProps {
  name: string;
  email: string;
  password: string;
  onDone: () => void;
}

// Shows a generated password once. It lives only in component state: the
// parent drops it on "Xong", and it is never stored or put in a URL.
export const OneTimePassword = ({
  name,
  email,
  password,
  onDone,
}: OneTimePasswordProps) => {
  const [isCopied, setIsCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // The sheet keeps its scroll position from the form; bring the password to
  // the top of the view.
  useEffect(() => {
    panelRef.current?.scrollIntoView({ block: "start" });
  }, []);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(password);
      setIsCopied(true);
      setCopyFailed(false);
    } catch {
      setIsCopied(false);
      setCopyFailed(true);
    }
  };

  return (
    <div ref={panelRef} className={`${CARD} space-y-4 p-4`} role="status">
      <p
        data-testid="one-time-password"
        className="rounded-xl bg-bg px-3 py-4 text-center font-mono text-2xl font-bold tracking-wider break-all text-fg select-all"
      >
        {password}
      </p>
      <button
        type="button"
        onClick={handleCopy}
        className={`${BUTTON_SECONDARY} w-full px-3 whitespace-nowrap`}
      >
        {isCopied ? (
          <Check className="size-5" aria-hidden />
        ) : (
          <Copy className="size-5" aria-hidden />
        )}
        {isCopied ? "Đã sao chép" : "Sao chép"}
      </button>
      {copyFailed && (
        <p role="alert" className="text-sm text-danger">
          {MEMBER_MESSAGES.COPY_FAILED}
        </p>
      )}
      <p className="text-sm font-medium text-danger">
        {MEMBER_MESSAGES.PASSWORD_ONCE}
      </p>
      <div className="min-w-0">
        <p className="truncate font-semibold text-fg">{name}</p>
        <p className="truncate text-sm text-muted">{email}</p>
      </div>
      <button
        type="button"
        onClick={onDone}
        className={`${BUTTON_PRIMARY} w-full px-3`}
      >
        Xong
      </button>
    </div>
  );
};

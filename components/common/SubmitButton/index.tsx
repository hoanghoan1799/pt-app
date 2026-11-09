"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

import { Spinner } from "@/components/common/Spinner";
import { BUTTON_PRIMARY } from "@/constants/styles";

interface SubmitButtonProps {
  children: ReactNode;
  className?: string;
  isPending?: boolean;
}

// Reads the pending state of the parent <form action>; pass `isPending` for
// forms submitted manually through a transition.
export const SubmitButton = ({
  children,
  className = BUTTON_PRIMARY,
  isPending,
}: SubmitButtonProps) => {
  const { pending } = useFormStatus();
  const isBusy = isPending ?? pending;

  return (
    <button
      type="submit"
      className={className}
      disabled={isBusy}
      aria-busy={isBusy}
    >
      {isBusy && <Spinner size="md" />}
      {children}
    </button>
  );
};

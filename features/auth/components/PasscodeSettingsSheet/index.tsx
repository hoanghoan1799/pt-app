"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { BottomSheet } from "@/components/common/BottomSheet";
import { ROUTES } from "@/constants/routes";
import { BUTTON_DANGER, BUTTON_SECONDARY } from "@/constants/styles";
import { PasscodeKeypad } from "@/features/auth/components/PasscodeKeypad";
import {
  changePasscode,
  setPasscode,
  turnOffPasscode,
} from "@/features/auth/services/passcode-actions";
import type { PasscodeResult } from "@/features/auth/types/passcode";
import {
  describePasscodeFailure,
  toPasscodeFailure,
} from "@/features/auth/utils/passcode-result";
import { PASSCODE_LENGTH } from "@/features/auth/utils/passcode-rules";

type Flow = "set" | "change" | "off";
type Step = "current" | "new" | "confirm";

interface PasscodeSettingsSheetProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  hasPasscode: boolean;
}

const FLOW_STEPS: Record<Flow, Step[]> = {
  set: ["new", "confirm"],
  change: ["current", "new", "confirm"],
  off: ["current"],
};

const STEP_LABEL: Record<Step, string> = {
  current: "Nhập mã khoá hiện tại",
  new: "Nhập mã khoá mới",
  confirm: "Nhập lại mã khoá mới",
};

const FLOW_TITLE: Record<Flow, string> = {
  set: "Đặt mã khoá",
  change: "Đổi mã khoá",
  off: "Tắt mã khoá",
};

const FLOW_DONE: Record<Flow, string> = {
  set: "Đã bật mã khoá",
  change: "Đã đổi mã khoá",
  off: "Đã tắt mã khoá",
};

const MISMATCH_MESSAGE = "Mã khoá nhập lại không khớp";

const runFlow = (
  flow: Flow,
  entries: Partial<Record<Step, string>>,
): Promise<PasscodeResult> => {
  if (flow === "set") {
    return setPasscode(entries.new ?? "");
  }
  if (flow === "change") {
    return changePasscode(entries.current ?? "", entries.new ?? "");
  }
  return turnOffPasscode(entries.current ?? "");
};

// Settings sheet behind the gear item "Mã khoá": set a passcode, or change /
// turn it off with the current one. Each step is typed on the shared keypad.
export const PasscodeSettingsSheet = ({
  isOpen,
  onOpenChange,
  hasPasscode,
}: PasscodeSettingsSheetProps) => {
  const router = useRouter();
  const defaultFlow: Flow | null = hasPasscode ? null : "set";
  // undefined = the default screen: set when no passcode, else the choice.
  const [chosenFlow, setChosenFlow] = useState<Flow | null | undefined>(
    undefined,
  );
  const flow = chosenFlow === undefined ? defaultFlow : chosenFlow;
  const [stepIndex, setStepIndex] = useState(0);
  const [entries, setEntries] = useState<Partial<Record<Step, string>>>({});
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Back to the first screen; runs on every close so the next open is fresh.
  const close = () => {
    setChosenFlow(undefined);
    setStepIndex(0);
    setEntries({});
    setValue("");
    setError(null);
    onOpenChange(false);
  };
  const handleOpenChange = (next: boolean) => {
    if (next) {
      onOpenChange(true);
    } else {
      close();
    }
  };

  const restart = (message: string | null) => {
    setStepIndex(0);
    setEntries({});
    setValue("");
    setError(message);
  };

  const finish = (activeFlow: Flow, all: Partial<Record<Step, string>>) => {
    startTransition(async () => {
      const result = await runFlow(activeFlow, all);

      if (result.status === "success") {
        toast.success(FLOW_DONE[activeFlow]);
        close();
        // The server layout and menu read hasPasscode.
        router.refresh();
        return;
      }
      const failure = toPasscodeFailure(result);

      if (failure.signedOut) {
        close();
        toast.error("Đã đăng xuất vì nhập sai quá 5 lần");
        router.replace(ROUTES.ADMIN_LOGIN);
        return;
      }
      restart(describePasscodeFailure(failure));
    });
  };

  const onChange = (next: string) => {
    setValue(next);
    setError(null);
    if (!flow || next.length !== PASSCODE_LENGTH) {
      return;
    }
    const steps = FLOW_STEPS[flow];
    const step = steps[stepIndex];
    const all = { ...entries, [step]: next };

    if (step === "confirm" && all.confirm !== all.new) {
      restart(MISMATCH_MESSAGE);
      return;
    }
    if (stepIndex === steps.length - 1) {
      setEntries(all);
      finish(flow, all);
      return;
    }
    setEntries(all);
    setStepIndex(stepIndex + 1);
    setValue("");
  };

  const chooseFlow = (next: Flow) => {
    setChosenFlow(next);
    restart(null);
  };

  const step = flow ? FLOW_STEPS[flow][stepIndex] : null;

  return (
    <BottomSheet
      isOpen={isOpen}
      onOpenChange={handleOpenChange}
      title={flow ? FLOW_TITLE[flow] : "Mã khoá"}
      description={
        flow
          ? undefined
          : "Mã khoá đang bật. Ứng dụng sẽ khoá sau 5 phút không dùng."
      }
    >
      {flow && step ? (
        <div className="flex flex-col items-center gap-3 pt-2">
          <p className="text-base font-medium text-fg">{STEP_LABEL[step]}</p>
          <p role="alert" className="min-h-5 text-sm font-medium text-danger">
            {error}
          </p>
          <PasscodeKeypad
            value={value}
            onChange={onChange}
            isDisabled={isPending}
            hasError={Boolean(error)}
          />
          {hasPasscode && (
            <button
              type="button"
              className="mt-2 min-h-11 px-3 text-sm font-medium text-muted"
              onClick={() => setChosenFlow(null)}
            >
              Quay lại
            </button>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <button
            type="button"
            className={BUTTON_SECONDARY}
            onClick={() => chooseFlow("change")}
          >
            Đổi mã khoá
          </button>
          <button
            type="button"
            className={BUTTON_DANGER}
            onClick={() => chooseFlow("off")}
          >
            Tắt mã khoá
          </button>
        </div>
      )}
    </BottomSheet>
  );
};

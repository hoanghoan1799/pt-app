import { ClipboardPaste } from "lucide-react";
import type { FormEvent } from "react";

import { SubmitButton } from "@/components/common/SubmitButton";
import {
  BUTTON_PRIMARY,
  BUTTON_SECONDARY,
  FIELD_ERROR,
  INPUT,
  LABEL,
  TEXTAREA,
} from "@/constants/styles";
import { YoutubePreview } from "@/features/workouts/components/YoutubePreview";
import { EXERCISE_LIMITS } from "@/features/workouts/constants/messages";
import type { Exercise } from "@/features/workouts/types/workout";

interface ExerciseFormViewProps {
  exercise: Exercise | null;
  userId: number;
  date: string;
  youtubeUrl: string;
  youtubeId: string | null;
  hasInvalidUrl: boolean;
  fieldErrors: Partial<Record<string, string>>;
  isPending: boolean;
  onYoutubeUrlChange: (value: string) => void;
  onPaste: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

export const ExerciseFormView = ({
  exercise,
  userId,
  date,
  youtubeUrl,
  youtubeId,
  hasInvalidUrl,
  fieldErrors,
  isPending,
  onYoutubeUrlChange,
  onPaste,
  onSubmit,
}: ExerciseFormViewProps) => {
  const youtubeError =
    fieldErrors.youtubeUrl ??
    (hasInvalidUrl ? "Link YouTube không hợp lệ" : "");

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <input type="hidden" name="exerciseId" value={exercise?.id ?? ""} />
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="date" value={date} />

      <div>
        <label htmlFor="youtubeUrl" className={LABEL}>
          Link video YouTube <span className="text-danger">*</span>
        </label>
        <div className="flex gap-2">
          <input
            id="youtubeUrl"
            name="youtubeUrl"
            type="url"
            inputMode="url"
            value={youtubeUrl}
            onChange={(event) => onYoutubeUrlChange(event.target.value)}
            placeholder="https://youtu.be/…"
            autoCapitalize="off"
            autoCorrect="off"
            aria-invalid={Boolean(youtubeError)}
            className={INPUT}
          />
          <button
            type="button"
            onClick={onPaste}
            className={`${BUTTON_SECONDARY} shrink-0 px-3.5`}
            aria-label="Dán link từ clipboard"
          >
            <ClipboardPaste className="size-5" aria-hidden />
          </button>
        </div>
        {youtubeError && <p className={FIELD_ERROR}>{youtubeError}</p>}
        <div className="mt-3">
          <YoutubePreview videoId={youtubeId} title={exercise?.title ?? ""} />
        </div>
      </div>

      <div>
        <label htmlFor="title" className={LABEL}>
          Tên bài tập <span className="text-danger">*</span>
        </label>
        <input
          id="title"
          name="title"
          defaultValue={exercise?.title}
          placeholder="VD: Bench press"
          maxLength={EXERCISE_LIMITS.TITLE}
          autoCapitalize="sentences"
          aria-invalid={Boolean(fieldErrors.title)}
          className={INPUT}
        />
        {fieldErrors.title && (
          <p className={FIELD_ERROR}>{fieldErrors.title}</p>
        )}
      </div>

      <div className="grid grid-cols-[2fr_3fr] gap-3">
        <div>
          <label htmlFor="sets" className={LABEL}>
            Số hiệp
          </label>
          <input
            id="sets"
            name="sets"
            defaultValue={exercise?.sets ?? ""}
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="4"
            aria-invalid={Boolean(fieldErrors.sets)}
            className={INPUT}
          />
        </div>
        <div>
          <label htmlFor="reps" className={LABEL}>
            Số lần / thời gian
          </label>
          <input
            id="reps"
            name="reps"
            defaultValue={exercise?.reps}
            placeholder="10-12 hoặc 30 giây"
            maxLength={EXERCISE_LIMITS.REPS}
            className={INPUT}
          />
        </div>
      </div>
      {(fieldErrors.sets || fieldErrors.reps) && (
        <p className={`${FIELD_ERROR} -mt-2`}>
          {fieldErrors.sets ?? fieldErrors.reps}
        </p>
      )}

      <div>
        <label htmlFor="description" className={LABEL}>
          Mô tả / lưu ý kỹ thuật
        </label>
        <textarea
          id="description"
          name="description"
          defaultValue={exercise?.description}
          rows={4}
          maxLength={EXERCISE_LIMITS.DESCRIPTION}
          placeholder="VD: Siết bụng, hạ tạ chậm 3 giây, nghỉ 90 giây giữa hiệp"
          className={TEXTAREA}
        />
        {fieldErrors.description && (
          <p className={FIELD_ERROR}>{fieldErrors.description}</p>
        )}
      </div>

      <SubmitButton
        className={`${BUTTON_PRIMARY} w-full`}
        isPending={isPending}
      >
        {exercise ? "Lưu thay đổi" : "Thêm bài tập"}
      </SubmitButton>
    </form>
  );
};

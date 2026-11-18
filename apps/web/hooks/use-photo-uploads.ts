"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface PhotoUpload {
  key: string;
  // Object URL of the picked file, for the thumbnail.
  previewUrl: string;
  status: "uploading" | "done" | "error";
  // Server id once uploaded.
  id: number | null;
  // Server-written (Vietnamese) message of the failure.
  error: string | null;
  // False when trying again cannot help (a file that cannot be decoded).
  canRetry: boolean;
}

interface Options {
  max: number;
  concurrency: number;
  // Resizes / re-encodes a picked file.
  prepare: (file: File) => Promise<Blob>;
  upload: (blob: Blob) => Promise<number>;
  // True for a failure that trying again cannot fix.
  isFatal?: (error: unknown) => boolean;
  messageOf: (error: unknown) => string;
}

// A list of photos picked by the person, each prepared and uploaded on its
// own with at most `concurrency` at a time; every photo keeps its status so a
// failed one can be retried or removed without touching the others. Shared by
// the post composer and the chat composer.
export const usePhotoUploads = ({
  max,
  concurrency,
  prepare,
  upload,
  isFatal,
  messageOf,
}: Options) => {
  const [items, setItems] = useState<PhotoUpload[]>([]);
  const itemsRef = useRef<PhotoUpload[]>([]);
  const files = useRef(new Map<string, File>());
  const blobs = useRef(new Map<string, Blob>());
  const waiting = useRef<string[]>([]);
  const running = useRef(0);
  const counter = useRef(0);
  const optionsRef = useRef({ prepare, upload, isFatal, messageOf });
  // The queue restarts itself when an upload ends.
  const pumpRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    optionsRef.current = { prepare, upload, isFatal, messageOf };
  });

  const commit = useCallback((next: PhotoUpload[]) => {
    itemsRef.current = next;
    setItems(next);
  }, []);

  const patch = useCallback(
    (key: string, change: Partial<PhotoUpload>) => {
      commit(
        itemsRef.current.map((item) =>
          item.key === key ? { ...item, ...change } : item,
        ),
      );
    },
    [commit],
  );

  const run = useCallback(
    async (key: string) => {
      const file = files.current.get(key);

      if (!file) {
        return;
      }
      patch(key, { status: "uploading", error: null });
      try {
        const options = optionsRef.current;
        const blob = blobs.current.get(key) ?? (await options.prepare(file));

        blobs.current.set(key, blob);
        const id = await options.upload(blob);

        // Removed while it was uploading: the pending row is cleaned up later.
        if (files.current.has(key)) {
          patch(key, { status: "done", id });
        }
      } catch (error) {
        if (files.current.has(key)) {
          patch(key, {
            status: "error",
            error: optionsRef.current.messageOf(error),
            canRetry: !optionsRef.current.isFatal?.(error),
          });
        }
      }
    },
    [patch],
  );

  const pump = useCallback(() => {
    while (running.current < concurrency && waiting.current.length > 0) {
      const key = waiting.current.shift() as string;

      running.current += 1;
      void run(key).finally(() => {
        running.current -= 1;
        pumpRef.current();
      });
    }
  }, [concurrency, run]);

  useEffect(() => {
    pumpRef.current = pump;
  }, [pump]);

  // Adds the picked files up to the free slots; returns how many were left out.
  const add = useCallback(
    (picked: File[]) => {
      const free = Math.max(0, max - itemsRef.current.length);
      const accepted = picked.slice(0, free);
      const added = accepted.map((file): PhotoUpload => {
        counter.current += 1;
        const key = `photo-${counter.current}`;

        files.current.set(key, file);
        waiting.current.push(key);
        return {
          key,
          previewUrl: URL.createObjectURL(file),
          status: "uploading",
          id: null,
          error: null,
          canRetry: true,
        };
      });

      commit([...itemsRef.current, ...added]);
      pump();
      return picked.length - accepted.length;
    },
    [commit, max, pump],
  );

  const retry = useCallback(
    (key: string) => {
      if (!files.current.has(key)) {
        return;
      }
      patch(key, { status: "uploading", error: null });
      waiting.current.push(key);
      pump();
    },
    [patch, pump],
  );

  const remove = useCallback(
    (key: string) => {
      const item = itemsRef.current.find((entry) => entry.key === key);

      if (item) {
        URL.revokeObjectURL(item.previewUrl);
      }
      files.current.delete(key);
      blobs.current.delete(key);
      waiting.current = waiting.current.filter((entry) => entry !== key);
      commit(itemsRef.current.filter((entry) => entry.key !== key));
    },
    [commit],
  );

  const reset = useCallback(() => {
    for (const item of itemsRef.current) {
      URL.revokeObjectURL(item.previewUrl);
    }
    files.current.clear();
    blobs.current.clear();
    waiting.current = [];
    commit([]);
  }, [commit]);

  useEffect(
    () => () => {
      for (const item of itemsRef.current) {
        URL.revokeObjectURL(item.previewUrl);
      }
    },
    [],
  );

  return { items, add, retry, remove, reset };
};

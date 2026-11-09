import type { Ref, RefCallback } from "react";

// Combines several refs (callback or object) into one callback ref. Forwards
// React 19 ref cleanups; refs without a cleanup are reset to null on detach.
export const mergeRefs = <T>(
  ...refs: Array<Ref<T> | undefined>
): RefCallback<T> => {
  return (node) => {
    const cleanups = refs.map((ref) => {
      if (typeof ref === "function") {
        const cleanup = ref(node);

        return typeof cleanup === "function" ? cleanup : () => ref(null);
      }
      if (ref) {
        ref.current = node;
      }

      return () => {
        if (ref) {
          ref.current = null;
        }
      };
    });

    return () => {
      cleanups.forEach((cleanup) => cleanup());
    };
  };
};

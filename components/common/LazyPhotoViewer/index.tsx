"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";

import type { PhotoViewer } from "@/components/common/PhotoViewer";
import { useHasOpened } from "@/hooks/use-has-opened";

const Viewer = dynamic(
  () =>
    import("@/components/common/PhotoViewer").then(
      (module) => module.PhotoViewer,
    ),
  { ssr: false },
);

// PhotoViewer for screens that show it only after a tap on a photo. Its code
// (swipe, download, keyboard handling) loads on the first open instead of with
// the page; once opened it stays mounted so the close behaves as before. No
// loading fallback: the viewer is a full-screen overlay that appears as soon
// as the module arrives.
export const LazyPhotoViewer = (props: ComponentProps<typeof PhotoViewer>) => {
  const hasOpened = useHasOpened(props.index !== null);

  return hasOpened ? <Viewer {...props} /> : null;
};

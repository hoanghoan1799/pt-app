export type ScrollEdge = "top" | "bottom";

export interface ScrollMetrics {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
}

// Pixels between the viewport and the given edge of the content. iOS rubber
// banding can report scrollTop below 0 or past the maximum; both clamp to 0.
export const distanceFromEdge = (
  edge: ScrollEdge,
  { scrollTop, scrollHeight, clientHeight }: ScrollMetrics,
): number =>
  Math.max(
    0,
    edge === "top" ? scrollTop : scrollHeight - scrollTop - clientHeight,
  );

export const isAwayFromEdge = (
  edge: ScrollEdge,
  metrics: ScrollMetrics,
  threshold: number,
): boolean => distanceFromEdge(edge, metrics) > threshold;

export const scrollBehaviorFor = (
  prefersReducedMotion: boolean,
): ScrollBehavior => (prefersReducedMotion ? "auto" : "smooth");

const MAX_COUNT = 99;

// Badge text for the jump button; null hides the badge.
export const formatJumpCount = (n: number): string | null => {
  if (!(n > 0)) {
    return null;
  }
  return n > MAX_COUNT ? `${MAX_COUNT}+` : String(Math.floor(n));
};

export const SWIPE_MIN_PX = 50;

// A horizontal swipe: far enough, and clearly more sideways than vertical.
// Swiping left (the finger moves left) goes to the next item.
export const swipeDirection = (
  dx: number,
  dy: number,
): "next" | "previous" | null => {
  if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) < Math.abs(dy) * 1.5) {
    return null;
  }
  return dx < 0 ? "next" : "previous";
};

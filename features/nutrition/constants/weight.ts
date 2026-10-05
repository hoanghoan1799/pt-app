export const WEIGHT_CHART_WEEKS = 12;

// SVG user units; the chart scales to its container width.
export const WEIGHT_CHART = {
  WIDTH: 340,
  HEIGHT: 190,
  PADDING: { top: 16, right: 16, bottom: 26, left: 36 },
  // Show an x label every N weeks so dates never collide on a phone.
  X_LABEL_EVERY: 3,
  MARKER_RADIUS: 4,
} as const;

// Candidate y tick steps in kg, smallest first.
export const WEIGHT_TICK_STEPS = [0.5, 1, 2, 5, 10];
export const WEIGHT_TICK_TARGET = 4;

// Plot area inside the SVG, derived from the size and padding above.
export const WEIGHT_PLOT_AREA = {
  left: WEIGHT_CHART.PADDING.left,
  right: WEIGHT_CHART.WIDTH - WEIGHT_CHART.PADDING.right,
  top: WEIGHT_CHART.PADDING.top,
  bottom: WEIGHT_CHART.HEIGHT - WEIGHT_CHART.PADDING.bottom,
};

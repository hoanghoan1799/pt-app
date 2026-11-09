// Copy the set logger still builds in Vietnamese. formatSet (utils/set-logger.ts)
// is also rendered by members and the dashboard, which are not translated yet,
// so its two labels stay here. Other UI copy lives in messages/*/workouts.json.
export const SET_LOGGER_COPY = {
  BODYWEIGHT: "Tự trọng",
  WEIGHT_UNIT: "kg",
} as const;

// Client-side validation messages for the set rows (utils/set-logger.ts,
// tested). They still read in Vietnamese; see the i18n spec's PR order.
export const describeMissingReps = (setNumber: number) =>
  `Nhập số lần cho hiệp ${setNumber}`;

export const describeRowError = (setNumber: number, message: string) =>
  `Hiệp ${setNumber}: ${message}`;

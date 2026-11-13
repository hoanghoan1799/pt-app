// Per-day meal-plan completion (KAN-119, decision 3): how many of the planned
// meals the trainee marked eaten ("Đạt"). Extra food and note-only marks do
// not count. The API works it out (apps/api/src/nutrition/rules); the web only
// shows it.
export type DayCompletion = "complete" | "partial" | "none";

export const WORKOUT_MESSAGES = {
  INVALID_INPUT: "Vui lòng kiểm tra lại thông tin",
  DAY_SAVED: "Đã lưu thông tin ngày",
  EXERCISE_CREATED: "Đã thêm bài tập",
  EXERCISE_UPDATED: "Đã cập nhật bài tập",
  EXERCISE_DELETED: "Đã xóa bài tập",
  EXERCISE_NOT_FOUND: "Bài tập không còn tồn tại",
  USER_NOT_FOUND: "Không tìm thấy user",
  COPY_EMPTY: "Tuần này chưa có nội dung để sao chép",
  COPY_SAME_WEEK: "Hãy chọn một tuần khác hoặc user khác",
  COMPLETION_TOO_EARLY: "Chưa tới ngày tập bài này",
  COMPLETION_DONE: "Đã đánh dấu tập xong 💪",
} as const;

export const EXERCISE_LIMITS = {
  TITLE: 120,
  DESCRIPTION: 2000,
  REPS: 40,
  MAX_SETS: 50,
  DAY_TITLE: 120,
  DAY_NOTE: 1000,
} as const;

export const CONFIRM_MESSAGES = {
  DELETE_EXERCISE: "Xóa bài tập này?",
  COPY_WEEK: "Lịch của tuần đích sẽ bị thay thế bằng tuần này. Tiếp tục?",
} as const;

export const WORKOUT_MESSAGES = {
  INVALID_INPUT: "Vui lòng kiểm tra lại thông tin",
  DAY_SAVED: "Đã lưu thông tin ngày",
  EXERCISE_CREATED: "Đã thêm bài tập",
  EXERCISE_UPDATED: "Đã cập nhật bài tập",
  LINK_CHANGE_NEEDS_CONFIRM: "Đổi link video cần xác nhận xóa số liệu đã ghi",
  EXERCISE_NOT_FOUND: "Bài tập không còn tồn tại",
  USER_NOT_FOUND: "Không tìm thấy user",
  COPY_EMPTY: "Tuần này chưa có nội dung để sao chép",
  COPY_SAME_WEEK: "Hãy chọn một tuần khác hoặc user khác",
  COPY_TARGET_HAS_SETS: "Tuần đích đã có buổi tập được ghi, không thể ghi đè",
  COMPLETION_TOO_EARLY: "Chưa tới ngày tập bài này",
  SET_WEIGHT_RANGE: "Mức tạ từ 0,5 đến 500 kg",
  SET_WEIGHT_STEP: "Mức tạ phải chia hết cho 0,5 kg",
  SET_REPS_INTEGER: "Số lần phải là số nguyên",
  SET_REPS_RANGE: "Số lần từ 1 đến 100",
  SET_TOO_MANY: "Tối đa 10 hiệp",
} as const;

// Limits for logged sets (spec D3, Q14).
export const SET_LIMITS = {
  MAX_ROWS: 10,
  MIN_WEIGHT_KG: 0.5,
  MAX_WEIGHT_KG: 500,
  MIN_REPS: 1,
  MAX_REPS: 100,
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
  DELETE_EXERCISE_WITH_SETS:
    "Học viên đã ghi số liệu cho bài này. Xóa bài tập sẽ xóa luôn số liệu. Tiếp tục?",
} as const;

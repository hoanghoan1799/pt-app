export const MEAL_COUNT_LIMITS = { min: 2, max: 6, fallback: 3 } as const;

export const MEAL_PLAN_LIMITS = {
  MEAL_NAME: 40,
  MAX_MEALS_PER_DAY: 10,
  MAX_ITEMS_PER_MEAL: 20,
  MAX_GRAMS: 3000,
  FOOD_NOTE: 500,
} as const;

export const MEAL_PLAN_MESSAGES = {
  INVALID_INPUT: "Vui lòng kiểm tra lại thông tin",
  DAY_NOT_FOUND: "Ngày này không có plan",
  MEAL_NOT_FOUND: "Bữa này không còn tồn tại",
  ITEM_NOT_FOUND: "Món này không còn trong bữa",
  FOOD_NOT_FOUND: "Món này không còn trong thư viện",
  MEMBER_NOT_FOUND: "Không tìm thấy học viên",
  PLAN_EXISTS: "Ngày này đã có plan",
  FOOD_ALREADY_IN_MEAL: "Món này đã có trong bữa",
  TOO_MANY_MEALS: "Một ngày tối đa 10 bữa",
  TOO_MANY_ITEMS: "Một bữa tối đa 20 món",
  LAST_MEAL: "Plan cần ít nhất một bữa. Xóa cả plan nếu không dùng nữa.",
  NO_TARGET: "Chưa có mục tiêu dinh dưỡng cho ngày này, đặt mục tiêu trước",
  NOTHING_TO_SOLVE: "Thêm ít nhất một món cần tính gram",
  SHARES_TOTAL: "Tổng phần trăm các bữa phải bằng 100",
  REORDER_MISMATCH: "Danh sách bữa đã thay đổi, tải lại trang",
  NO_LAST_WEEK: "Tuần trước chưa có plan nào",
  NO_TARGET_DAYS: "Chọn ít nhất một ngày",
  PAST_TARGET_DAYS: "Không thể sao chép sang ngày đã qua.",
  PREFERENCES_SAVED: "Đã lưu yêu cầu của bạn",
} as const;

// Trainee meal log (KAN-71).
export const MEAL_LOG_LIMITS = {
  MAX_LOGS_PER_MEAL: 30,
  CUSTOM_NAME: 60,
  MARK_NOTE: 300,
  MAX_KCAL: 5000,
  MAX_MACRO_GRAMS: 1000,
} as const;

export const MEAL_LOG_MESSAGES = {
  MEAL_NOT_FOUND: "Bữa này không còn trong plan của bạn",
  LOG_NOT_FOUND: "Món này không còn trong nhật ký",
  FOOD_NOT_FOUND: "Món này không còn trong thư viện",
  FOOD_MISSING: "Món này không còn trong thư viện, hãy xóa rồi ghi lại",
  MISSING_FOOD_NAME: "Món không còn trong thư viện",
  FUTURE_DAY: "Chưa tới ngày này, quay lại ghi sau nhé",
  TOO_MANY_LOGS: "Một bữa tối đa 30 món",
  NAME_REQUIRED: "Nhập tên món",
  GRAMS_REQUIRED: "Nhập số gram lớn hơn 0",
} as const;

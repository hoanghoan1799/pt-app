export const FOOD_LIMITS = {
  NAME_MAX: 80,
  SOURCE_MAX: 120,
  SERVING_LABEL_MAX: 30,
  // Per 100 g of food, a macro can't weigh more than the food itself.
  MAX_GRAMS_PER_100G: 100,
  MAX_KCAL_PER_100G: 910,
  MAX_SERVING_GRAMS: 5000,
  MAX_AMOUNT_GRAMS: 10000,
  // Entered kcal may differ from the 4/4/9 figure by at most this share.
  KCAL_GAP_LIMIT: 0.1,
} as const;

export const FOOD_MESSAGES = {
  INVALID_INPUT: "Vui lòng kiểm tra lại thông tin",
  CREATED: "Đã thêm món",
  UPDATED: "Đã lưu thay đổi",
  NAME_TAKEN: "Đã có món trùng tên. Thêm trạng thái (sống/chín) để phân biệt.",
  NOT_FOUND: "Món này không còn tồn tại",
  CONFIRM_LABEL: "Tôi đã kiểm tra số liệu",
} as const;

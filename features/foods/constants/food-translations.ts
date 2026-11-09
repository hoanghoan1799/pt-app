import { toNameKey } from "@/utils/name";

// English and Simplified Chinese names of the starter foods, keyed by
// toNameKey(Vietnamese name). Foods seeded before these columns existed are
// translated at read time from this map; a PT-edited column wins over it.
const ROWS: [vi: string, en: string, zh: string][] = [
  ["Ức gà (chín)", "Chicken breast (cooked)", "鸡胸肉（熟）"],
  ["Ức gà (sống)", "Chicken breast (raw)", "鸡胸肉（生）"],
  [
    "Đùi gà bỏ da (chín)",
    "Skinless chicken thigh (cooked)",
    "去皮鸡腿肉（熟）",
  ],
  [
    "Thịt bò xay 90% nạc (sống)",
    "Ground beef, 90% lean (raw)",
    "90%瘦牛肉末（生）",
  ],
  [
    "Thịt bò xay 90% nạc (chín)",
    "Ground beef, 90% lean (cooked)",
    "90%瘦牛肉末（熟）",
  ],
  ["Thịt heo thăn (chín)", "Pork loin (cooked)", "猪里脊肉（熟）"],
  ["Ba chỉ heo (sống)", "Pork belly (raw)", "五花肉（生）"],
  ["Cá hồi (sống)", "Salmon (raw)", "三文鱼（生）"],
  ["Cá hồi (chín)", "Salmon (cooked)", "三文鱼（熟）"],
  ["Cá ngừ đóng hộp ngâm nước", "Canned tuna in water", "水浸金枪鱼罐头"],
  ["Cá da trơn (sống)", "Catfish (raw)", "鲶鱼（生）"],
  ["Cá tuyết (chín)", "Cod (cooked)", "鳕鱼（熟）"],
  ["Tôm (sống)", "Shrimp (raw)", "虾（生）"],
  ["Tôm (chín)", "Shrimp (cooked)", "虾（熟）"],
  ["Mực (sống)", "Squid (raw)", "鱿鱼（生）"],
  ["Trứng gà luộc", "Boiled egg", "水煮鸡蛋"],
  ["Trứng gà (sống)", "Egg (raw)", "鸡蛋（生）"],
  ["Sữa tươi nguyên kem", "Whole milk", "全脂牛奶"],
  ["Sữa tươi không béo", "Skim milk", "脱脂牛奶"],
  ["Sữa chua không đường", "Plain unsweetened yogurt", "无糖酸奶"],
  ["Sữa chua Hy Lạp không béo", "Nonfat Greek yogurt", "脱脂希腊酸奶"],
  ["Phô mai Cheddar", "Cheddar cheese", "切达奶酪"],
  ["Cơm trắng (chín)", "White rice (cooked)", "白米饭（熟）"],
  ["Gạo trắng (sống)", "White rice (raw)", "白米（生）"],
  ["Cơm gạo lứt (chín)", "Brown rice (cooked)", "糙米饭（熟）"],
  ["Khoai lang (sống)", "Sweet potato (raw)", "红薯（生）"],
  ["Khoai lang (nướng)", "Sweet potato (baked)", "红薯（烤）"],
  ["Khoai tây (luộc)", "Potato (boiled)", "土豆（煮）"],
  ["Yến mạch (khô)", "Oats (dry)", "燕麦（干）"],
  ["Bánh mì trắng", "White bread", "白面包"],
  ["Mì Ý (chín)", "Spaghetti (cooked)", "意大利面（熟）"],
  ["Bún gạo (chín)", "Rice vermicelli (cooked)", "米粉（熟）"],
  ["Bông cải xanh (sống)", "Broccoli (raw)", "西兰花（生）"],
  ["Bông cải xanh (luộc)", "Broccoli (boiled)", "西兰花（煮）"],
  ["Cà rốt (sống)", "Carrot (raw)", "胡萝卜（生）"],
  ["Cà chua (sống)", "Tomato (raw)", "番茄（生）"],
  ["Dưa leo (sống)", "Cucumber (raw)", "黄瓜（生）"],
  ["Cải bó xôi (sống)", "Spinach (raw)", "菠菜（生）"],
  ["Xà lách (sống)", "Lettuce (raw)", "生菜（生）"],
  ["Bắp cải (sống)", "Cabbage (raw)", "卷心菜（生）"],
  ["Nấm trắng (sống)", "White mushrooms (raw)", "白蘑菇（生）"],
  ["Ớt chuông đỏ (sống)", "Red bell pepper (raw)", "红甜椒（生）"],
  ["Chuối", "Banana", "香蕉"],
  ["Táo", "Apple", "苹果"],
  ["Cam", "Orange", "橙子"],
  ["Xoài", "Mango", "芒果"],
  ["Dưa hấu", "Watermelon", "西瓜"],
  ["Đu đủ", "Papaya", "木瓜"],
  ["Bơ", "Avocado", "牛油果"],
  ["Đậu hũ trắng", "Plain tofu", "白豆腐"],
  ["Đậu nành (luộc)", "Soybeans (boiled)", "黄豆（煮）"],
  ["Đậu đen (luộc)", "Black beans (boiled)", "黑豆（煮）"],
  ["Đậu lăng (luộc)", "Lentils (boiled)", "扁豆（煮）"],
  ["Hạnh nhân", "Almonds", "杏仁"],
  ["Đậu phộng (sống)", "Peanuts (raw)", "花生（生）"],
  ["Bơ đậu phộng", "Peanut butter", "花生酱"],
  ["Dầu ăn (dầu đậu nành)", "Cooking oil (soybean oil)", "食用油（大豆油）"],
  ["Dầu ô liu", "Olive oil", "橄榄油"],
  ["Dầu dừa", "Coconut oil", "椰子油"],
  ["Bơ lạt", "Unsalted butter", "无盐黄油"],
  ["Mỡ heo", "Lard", "猪油"],
  ["Mật ong", "Honey", "蜂蜜"],
  ["Đường trắng", "White sugar", "白砂糖"],
  ["Nước ngọt có ga (cola)", "Soda (cola)", "碳酸饮料（可乐）"],
];

export interface FoodTranslation {
  en: string;
  zh: string;
}

export const SEED_FOOD_TRANSLATIONS: Record<string, FoodTranslation> =
  Object.fromEntries(ROWS.map(([vi, en, zh]) => [toNameKey(vi), { en, zh }]));

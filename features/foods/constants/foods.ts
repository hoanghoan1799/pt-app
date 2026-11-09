import {
  Apple,
  Bean,
  Beef,
  Droplet,
  Egg,
  Fish,
  Leaf,
  type LucideIcon,
  Soup,
  Utensils,
  Wheat,
} from "lucide-react";

import type { FoodGroup, FoodState } from "@/features/foods/types/food";

// Display labels are keys under the foods.labels namespace (translated at render).
export interface FoodGroupInfo {
  labelKey: `groups.${FoodGroup}`;
  icon: LucideIcon;
  // Tailwind classes for the icon tile: tinted background plus icon colour.
  tile: string;
}

export const FOOD_GROUPS: Record<FoodGroup, FoodGroupInfo> = {
  meat: {
    labelKey: "groups.meat",
    icon: Beef,
    tile: "bg-rose-500/15 text-rose-600",
  },
  seafood: {
    labelKey: "groups.seafood",
    icon: Fish,
    tile: "bg-sky-500/15 text-sky-600",
  },
  egg_dairy: {
    labelKey: "groups.egg_dairy",
    icon: Egg,
    tile: "bg-amber-500/15 text-amber-600",
  },
  starch: {
    labelKey: "groups.starch",
    icon: Wheat,
    tile: "bg-yellow-500/15 text-yellow-700",
  },
  vegetable: {
    labelKey: "groups.vegetable",
    icon: Leaf,
    tile: "bg-green-500/15 text-green-700",
  },
  fruit: {
    labelKey: "groups.fruit",
    icon: Apple,
    tile: "bg-orange-500/15 text-orange-600",
  },
  legume_nut: {
    labelKey: "groups.legume_nut",
    icon: Bean,
    tile: "bg-lime-600/15 text-lime-700",
  },
  fat_oil: {
    labelKey: "groups.fat_oil",
    icon: Droplet,
    tile: "bg-cyan-500/15 text-cyan-700",
  },
  dish: {
    labelKey: "groups.dish",
    icon: Soup,
    tile: "bg-red-500/15 text-red-600",
  },
  other: {
    labelKey: "groups.other",
    icon: Utensils,
    tile: "bg-zinc-500/15 text-zinc-600",
  },
};

export const FOOD_STATE_LABELS: Record<FoodState, `state.${FoodState}`> = {
  raw: "state.raw",
  cooked: "state.cooked",
};

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

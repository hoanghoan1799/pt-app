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

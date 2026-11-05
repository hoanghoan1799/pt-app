"use client";

import clsx from "clsx";
import { Search, UtensilsCrossed } from "lucide-react";

import { CARD, INPUT } from "@/constants/styles";
import { FoodCard } from "@/features/foods/components/FoodCard";
import { FOOD_GROUPS } from "@/features/foods/constants/foods";
import { useFoodFilter } from "@/features/foods/hooks/use-food-filter";
import type { Food } from "@/features/foods/types/food";

interface FoodListProps {
  foods: Food[];
  // Detail page of a food is `${basePath}/${food.id}`; a string because this
  // is a client component and server pages can't pass it a function.
  basePath: string;
  emptyHint?: string;
}

const CHIP =
  "inline-flex min-h-10 shrink-0 snap-start items-center rounded-full border px-4 text-sm font-semibold transition";
const CHIP_SELECTED = "border-accent bg-accent text-accent-fg shadow-sm";
const CHIP_IDLE = "border-line bg-surface text-fg";

export const FoodList = ({ foods, basePath, emptyHint }: FoodListProps) => {
  const { query, setQuery, group, setGroup, groupsInUse, filteredFoods } =
    useFoodFilter(foods);

  if (!foods.length) {
    return (
      <div
        className={`${CARD} flex flex-col items-center px-6 py-10 text-center`}
      >
        <UtensilsCrossed className="size-10 text-muted" aria-hidden />
        <p className="mt-3 font-semibold text-fg">Chưa có món nào</p>
        {emptyHint && <p className="mt-1 text-sm text-muted">{emptyHint}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted"
          aria-hidden
        />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Tìm món, ví dụ: uc ga"
          aria-label="Tìm món"
          autoCapitalize="none"
          autoCorrect="off"
          className={`${INPUT} pl-11`}
        />
      </div>
      <div className="relative -mx-4">
        <div
          role="group"
          aria-label="Lọc theo nhóm"
          className="flex snap-x snap-proximity scroll-px-4 gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]"
        >
          <button
            type="button"
            aria-pressed={group === "all"}
            onClick={() => setGroup("all")}
            className={clsx(CHIP, group === "all" ? CHIP_SELECTED : CHIP_IDLE)}
          >
            Tất cả
          </button>
          {groupsInUse.map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={group === item}
              onClick={() => setGroup(item)}
              className={clsx(CHIP, group === item ? CHIP_SELECTED : CHIP_IDLE)}
            >
              {FOOD_GROUPS[item].label}
            </button>
          ))}
        </div>
        {/* Right-edge fade hints that more chips scroll in. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-bg to-transparent"
        />
      </div>
      <p className="text-xs text-muted" aria-live="polite">
        {filteredFoods.length} món
      </p>
      {filteredFoods.length ? (
        <ul className="space-y-2">
          {filteredFoods.map((food) => (
            <FoodCard
              key={food.id}
              food={food}
              href={`${basePath}/${food.id}`}
            />
          ))}
        </ul>
      ) : (
        <div className={`${CARD} px-6 py-8 text-center`}>
          <p className="font-semibold text-fg">Không tìm thấy món nào</p>
          <p className="mt-1 text-sm text-muted">
            Thử gõ ít chữ hơn hoặc chọn nhóm khác.
          </p>
        </div>
      )}
    </div>
  );
};

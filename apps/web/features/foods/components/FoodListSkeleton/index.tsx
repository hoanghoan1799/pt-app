import { Search } from "lucide-react";
import { useTranslations } from "next-intl";

import { Input } from "@/components/common/Input";
import { Skeleton, SkeletonList } from "@/components/common/Skeleton";

// Mirrors FoodList while foods load. The search box only looks like the real
// one: it is disabled and unlabelled, so nothing typed before the list arrives
// is lost when FoodList replaces it, and only FoodList's box is "Tìm món".
export const FoodListSkeleton = () => {
  const t = useTranslations("foods.foodList");

  return (
    <div className="space-y-3" aria-hidden>
      <Input
        type="search"
        clearable
        leadingIcon={<Search className="size-5" aria-hidden />}
        placeholder={t("searchPlaceholder")}
        disabled
        autoCapitalize="none"
        autoCorrect="off"
      />
      <Skeleton className="h-10 w-2/3 rounded-full" />
      <SkeletonList rows={6} />
    </div>
  );
};

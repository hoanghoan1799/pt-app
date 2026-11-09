import { Search } from "lucide-react";
import { useTranslations } from "next-intl";

import { Input } from "@/components/common/Input";
import { Skeleton, SkeletonList } from "@/components/common/Skeleton";

// Mirrors FoodList while foods load: the search box is static and renders
// for real; the group chips and the rows depend on the foods.
export const FoodListSkeleton = () => {
  const t = useTranslations("foods.foodList");

  return (
    <div className="space-y-3">
      <Input
        type="search"
        clearable
        leadingIcon={<Search className="size-5" aria-hidden />}
        placeholder={t("searchPlaceholder")}
        aria-label={t("searchLabel")}
        autoCapitalize="none"
        autoCorrect="off"
      />
      <Skeleton className="h-10 w-2/3 rounded-full" />
      <SkeletonList rows={6} />
    </div>
  );
};

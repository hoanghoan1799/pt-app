"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

import { INPUT, LABEL } from "@/constants/styles";
import { PT_FILTER_PARAM } from "@/features/dashboard/utils/pt-filter";

interface PtFilterSelectProps {
  value: string;
  options: { id: number; username: string }[];
}

// Super admin dashboard filter: all trainees, those without a PT, or one PT's.
export const PtFilterSelect = ({ value, options }: PtFilterSelectProps) => {
  const t = useTranslations("dashboard.ptFilter");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const handleChange = (next: string) => {
    const params = new URLSearchParams(searchParams.toString());

    if (next === "all") {
      params.delete(PT_FILTER_PARAM);
    } else {
      params.set(PT_FILTER_PARAM, next);
    }

    const query = params.toString();

    router.push(query ? `${pathname}?${query}` : pathname);
  };

  return (
    <div>
      <label htmlFor="pt-filter" className={LABEL}>
        {t("label")}
      </label>
      <select
        id="pt-filter"
        value={value}
        onChange={(event) => handleChange(event.target.value)}
        className={INPUT}
      >
        <option value="all">{t("all")}</option>
        <option value="none">{t("none")}</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.username}
          </option>
        ))}
      </select>
    </div>
  );
};

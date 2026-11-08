"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { INPUT, LABEL } from "@/constants/styles";
import { PT_FILTER_PARAM } from "@/features/dashboard/utils/pt-filter";

interface PtFilterSelectProps {
  value: string;
  options: { id: number; username: string }[];
}

// Super admin dashboard filter: all trainees, those without a PT, or one PT's.
export const PtFilterSelect = ({ value, options }: PtFilterSelectProps) => {
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
        Lọc theo PT
      </label>
      <select
        id="pt-filter"
        value={value}
        onChange={(event) => handleChange(event.target.value)}
        className={INPUT}
      >
        <option value="all">Tất cả</option>
        <option value="none">Chưa có PT</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.username}
          </option>
        ))}
      </select>
    </div>
  );
};

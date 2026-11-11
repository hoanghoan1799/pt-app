import clsx from "clsx";

import type { Locale } from "@/utils/locale";

interface LocaleFlagProps {
  locale: Locale;
  className?: string;
}

const STRIPE_HEIGHT = 20 / 13;
const US_STRIPES = [0, 2, 4, 6, 8, 10, 12];
const US_STARS = [
  [2, 2],
  [6, 2],
  [10, 2],
  [4, 4.6],
  [8, 4.6],
  [2, 7.2],
  [6, 7.2],
  [10, 7.2],
];

const VIETNAM_STAR =
  "15,4.4 16.39,8.68 20.9,8.68 17.25,11.33 18.64,15.62 15,12.97 11.36,15.62 12.75,11.33 9.1,8.68 13.61,8.68";
const CHINA_STARS = [
  "5,2 5.67,4.07 7.85,4.07 6.09,5.35 6.76,7.43 5,6.15 3.24,7.43 3.91,5.35 2.15,4.07 4.33,4.07",
  "9.14,2.51 9.62,1.97 9.25,1.34 9.91,1.63 10.39,1.08 10.33,1.8 11,2.09 10.29,2.25 10.22,2.97 9.85,2.35",
  "11.01,4.14 11.66,3.82 11.56,3.1 12.07,3.62 12.72,3.3 12.38,3.95 12.88,4.47 12.17,4.34 11.83,4.99 11.73,4.27",
  "11.04,6.73 11.76,6.7 11.96,6 12.21,6.68 12.94,6.66 12.37,7.1 12.62,7.79 12.01,7.38 11.44,7.83 11.64,7.13",
  "9.22,8.38 9.9,8.63 10.35,8.06 10.32,8.79 11,9.05 10.3,9.24 10.26,9.96 9.87,9.36 9.16,9.55 9.62,8.98",
];

// Inline SVG flag per language: Windows has no flag emoji font, so emoji
// would show as the letters "VN"/"US"/"CN". Decorative only.
export const LocaleFlag = ({ locale, className }: LocaleFlagProps) => (
  <svg
    viewBox="0 0 30 20"
    aria-hidden="true"
    focusable="false"
    className={clsx(
      "h-[19px] w-7 shrink-0 rounded-[4px] shadow-sm ring-1 ring-line",
      className,
    )}
  >
    {locale === "vi" && (
      <>
        <rect width="30" height="20" fill="#DA251D" />
        <polygon points={VIETNAM_STAR} fill="#FFFF00" />
      </>
    )}
    {locale === "en" && (
      <>
        <rect width="30" height="20" fill="#FFFFFF" />
        {US_STRIPES.map((index) => (
          <rect
            key={index}
            y={index * STRIPE_HEIGHT}
            width="30"
            height={STRIPE_HEIGHT}
            fill="#B22234"
          />
        ))}
        <rect width="12" height={STRIPE_HEIGHT * 7} fill="#3C3B6E" />
        {US_STARS.map(([x, y]) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r="0.7" fill="#FFFFFF" />
        ))}
      </>
    )}
    {locale === "zh" && (
      <>
        <rect width="30" height="20" fill="#EE1C25" />
        {CHINA_STARS.map((points) => (
          <polygon key={points} points={points} fill="#FFFF00" />
        ))}
      </>
    )}
  </svg>
);

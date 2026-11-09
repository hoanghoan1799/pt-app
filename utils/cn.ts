import clsx, { type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// clsx + tailwind-merge: later classes win over earlier conflicting ones
// (e.g. a caller's `pr-10` replaces a component's `pr-4`), regardless of the
// order Tailwind emits them in CSS.
export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

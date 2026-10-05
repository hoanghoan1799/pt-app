export const PAGE_CONTAINER = "mx-auto w-full max-w-lg px-4";

export const CARD = "rounded-2xl border border-line bg-surface";

const BUTTON_BASE =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-5 text-base font-semibold transition active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50";

export const BUTTON_PRIMARY = `${BUTTON_BASE} bg-accent text-accent-fg`;
export const BUTTON_SECONDARY = `${BUTTON_BASE} border border-line bg-surface text-fg`;
export const BUTTON_DANGER = `${BUTTON_BASE} border border-danger/40 bg-surface text-danger`;

export const ICON_BUTTON =
  "inline-flex size-11 shrink-0 items-center justify-center rounded-xl text-muted transition active:bg-line disabled:opacity-30";

export const INPUT =
  "block min-h-12 w-full rounded-xl border border-line bg-surface px-4 text-base text-fg placeholder:text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30";
export const TEXTAREA = `${INPUT} min-h-24 py-3`;
export const LABEL = "mb-1.5 block text-sm font-medium text-fg";
export const FIELD_ERROR = "mt-1.5 text-sm text-danger";
export const SECTION_TITLE =
  "text-xs font-semibold uppercase tracking-wide text-muted";

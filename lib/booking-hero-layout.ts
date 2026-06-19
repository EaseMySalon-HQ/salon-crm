/** Matches the booking hero inner content grid on the public booking page. */
export const BOOKING_HERO_INNER_CLASS =
  "relative mx-auto grid w-full max-w-[1600px] grid-cols-1 gap-6 px-4 py-6 sm:gap-8 sm:px-6 sm:py-8 lg:grid-cols-booking-split lg:items-center lg:gap-10 lg:px-8 lg:py-10"

/** Same max width and horizontal padding — for settings previews without hero vertical padding. */
export const BOOKING_HERO_INNER_WIDTH_CLASS =
  "mx-auto w-full max-w-[1600px] px-4 sm:px-6 lg:px-8"

/** Main booking content below hero — matches hero column split (content + ~420px sidebar). */
export const BOOKING_PAGE_MAIN_GRID_CLASS =
  "grid w-full flex-1 grid-cols-1 lg:grid-cols-booking-split-compact xl:grid-cols-booking-split lg:items-start lg:gap-6 xl:gap-10"

/** Shared sticky sub-header row (Categories / Search / Cart) on the booking page. */
export const BOOKING_COLUMN_HEADER_CLASS =
  "sticky top-0 z-30 flex h-14 shrink-0 items-center border-b border-slate-100 bg-white/95 backdrop-blur-sm"

/** Max height for a sticky booking column (full viewport). */
export const BOOKING_STICKY_COLUMN_CLASS =
  "sticky top-0 z-20 max-h-[calc(100vh)] self-start"

/** Hero content band aspect ratio (~1600×408). */
export const BOOKING_HERO_BAND_CLASS = "aspect-[1600/408] max-h-28 min-h-11 w-full"

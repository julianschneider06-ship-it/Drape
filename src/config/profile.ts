// Texts of the Profile page.
export const PROFILE_TEXT = {
  title: "Profile",
  accountEmail: "Email address",
  accountHint: "Account coming later",
  feedHeading: "Feed settings",
  saleLabel: "Sale marker",
  bgLabel: "Drape Background",
  seasonLabel: "Seasonal decoration",
  saleGlobalOff: "Currently off for everyone",
  shopsHeading: "Shops",
  searchPlaceholder: "Search shops",
  yourShops: "Your shops",
  more: "More",
  less: "Less",
  emptyYours: "No shops changed yet.",
  hint: "Search for a shop to show it more or less often. It never hides a shop.",
  results: "Results",
  noMatch: "No shop found.",
  loading: "Loading shops…",
  failed: "Could not load the shops.",
  retry: "Try again",
} as const;
export const SHOP_LEVELS: { id: "less" | "normal" | "more"; label: string }[] = [{ id: "less", label: "Less" }, { id: "normal", label: "Normal" }, { id: "more", label: "More" }];

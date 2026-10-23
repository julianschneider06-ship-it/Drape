// Bottom-bar tabs (pure, so it can be tested): order left to right, Search only when it is switched on.
export type Tab = "foryou" | "search" | "likes" | "profile";
export const TAB_LABELS: Record<Tab, string> = { foryou: "For You", search: "Search", likes: "Wishlist", profile: "Profile" };
export const navTabs = (searchOn: boolean): Tab[] => (searchOn ? ["foryou", "search", "likes", "profile"] : ["foryou", "likes", "profile"]);
/** the bar is shown once the first-visit check ran and neither the welcome flow nor the tutorial is open */
export const navVisible = (navReady: boolean, onboardingOff: boolean) => navReady && onboardingOff;
/** Which panels exist and are shown for a tab. For You stays mounted, Search stays mounted once opened (selection, results and scroll survive tab switches), the Wishlist and the Profile page are mounted only while open. */
export const tabLayers = (tab: Tab, searchSeen: boolean) => ({ feedActive: tab === "foryou", searchMounted: searchSeen || tab === "search", searchActive: tab === "search", wishlistOpen: tab === "likes", profileOpen: tab === "profile" });

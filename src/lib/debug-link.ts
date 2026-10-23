/** ?debug=1 in the URL turns on the small test-device line at the bottom of the Profile page (nothing else) */
export const debugOn = (search: string | null | undefined): boolean => new URLSearchParams(search ?? "").get("debug") === "1";

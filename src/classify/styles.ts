// The 24 styles with the description that goes into the classification prompt. Edit here only.
export const STYLES = {
  streetwear: "oversized graphic, hoodies, sneakers, urban",
  old_money: "refined, quiet heritage, knitwear, tailoring, loafers",
  minimalism: "clean lines, neutral palette, no logos",
  gorpcore: "outdoor/hiking gear worn as fashion, fleece, trail shoes",
  techwear: "technical fabrics, utility pockets, dark, functional",
  y2k: "2000s: low-rise, metallic, baby tees, bold logos",
  vintage: "retro cuts or washes, worn-in, 60s-90s",
  preppy: "collegiate, polo, chinos, blazers, cable knit",
  sporty: "athletic wear, jerseys, track pants",
  classic: "timeless basics, tailored, safe wardrobe staples",
  quiet_luxury: "premium fabrics, no logos, muted tones",
  athleisure: "gym-to-street comfort",
  skater: "baggy, durable, skate shoes",
  workwear: "heavy canvas/denim, carpenter, chore jackets",
  western: "cowboy details, fringe, suede, boots",
  grunge: "distressed, flannel, dark, layered",
  dark_academia: "tweed, plaid, dark browns/greens, scholarly",
  coquette: "bows, lace, soft pink, delicate",
  scandi: "simple, functional, soft neutrals",
  business_casual: "smart office wear, relaxed tailoring",
  boho: "flowy, earthy, prints, relaxed",
  punk_edgy: "leather, studs, hardware, black",
  retro_sport: "vintage football/tracksuit, terrace casual",
  resort: "light, linen, vacation, tropical",
} as const;

export type StyleKey = keyof typeof STYLES;
export const STYLE_KEYS = Object.keys(STYLES) as StyleKey[];

// The 10 styles users pick in onboarding (later step).
export const ONBOARDING_STYLES: StyleKey[] = [
  "streetwear", "old_money", "minimalism", "gorpcore", "techwear", "y2k", "vintage", "preppy", "sporty", "classic",
];

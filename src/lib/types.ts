// Shapes shared by the feed API and the client.
export interface FeedCard {
  id: number; brand: string; name: string; slot: string; image: string; bg: string | null; whiten: number | null;
  bbox: number[] | null; aspect: number | null; cutout?: string | null; cutout_aspect?: number | null; presentation?: string | null; hem?: number | null; waist?: number | null; collar?: number | null; hood?: boolean | null; fill?: number | null; price_cents: number | null; compare_at_cents: number | null; currency: string | null; url: string; store: string; in_stock: boolean;
  /** Outfit preview hints from the classification (snapshot cards only; missing on DB cards = default look): subcategory, first colour, fit, silhouette, outer-layer flag */
  mq?: { sub: string | null; col: string | null; col2?: string | null; pat?: string | null; fit: string | null; sil: string | null; outer: boolean } | null;
}
export interface FeedAccessory { card: FeedCard; type: string; placement: "head" | "inline" | "side"; zone: string | null; size: string | null; front_flat: boolean | null; belt_shape: string | null; slot_no?: number }
export interface FeedAlt { rank: number; card: FeedCard; meta?: { type: string | null; size: string | null; front_flat: boolean | null; belt_shape: string | null } | null }
import type { OutfitTags } from "@/outfits/tags";
export type { OutfitTags };
export interface FeedOutfit { wl?: number[]; /* Wishlist outfits only: ids of the pieces that are liked products (the others are greyed filler) */ sc?: string | null; /* Search only: main colour name of the searched piece (for the shine strokes) */ og?: "women" | "men"; /* Search only: the searched direction differs from the feed's gender (set by the client; its likes carry no outfit context / taste signal) */ tags?: OutfitTags | null; id: number; kind: "three" | "full"; score: number; order: number; top: FeedCard; bottom: FeedCard | null; shoes: FeedCard; accessories?: FeedAccessory[]; alts?: Record<string, FeedAlt[]>; dyn?: { style: string; store: string; season: string; fit: number; bucket: string; pattern?: string; ids: number[] } }
export interface FeedResponse { items: FeedOutfit[]; next_cursor: number; size: number }

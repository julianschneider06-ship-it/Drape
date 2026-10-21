// Shapes shared by the feed API and the client.
export interface FeedCard {
  id: number; brand: string; name: string; slot: string; image: string; bg: string | null; whiten: number | null;
  bbox: number[] | null; aspect: number | null; cutout?: string | null; cutout_aspect?: number | null; presentation?: string | null; hem?: number | null; waist?: number | null; fill?: number | null; price_cents: number | null; compare_at_cents: number | null; currency: string | null; url: string; store: string; in_stock: boolean;
}
export interface FeedOutfit { id: number; kind: "three" | "full"; score: number; order: number; top: FeedCard; bottom: FeedCard | null; shoes: FeedCard }
export interface FeedResponse { items: FeedOutfit[]; next_cursor: number; size: number }

import type { SourceAdapter, SourceConfig } from "../types";
import { ShopifyAdapter } from "./shopify";
import { ZalandoAdapter } from "./zalando";

export function createAdapter(cfg: SourceConfig): SourceAdapter {
  switch (cfg.kind) {
    case "shopify": return new ShopifyAdapter(cfg);
    case "zalando": return new ZalandoAdapter(cfg);
    default: throw new Error(`Unknown source kind: ${cfg.kind}`);
  }
}

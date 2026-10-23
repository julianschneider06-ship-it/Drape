import type { SourceAdapter, SourceConfig } from "../types";
import { ShopifyAdapter } from "./shopify";
import { ZalandoAdapter } from "./zalando";
import { AwinAdapter } from "./awin";

export function createAdapter(cfg: SourceConfig): SourceAdapter {
  switch (cfg.kind) {
    case "shopify": return new ShopifyAdapter(cfg);
    case "awin": return new AwinAdapter(cfg);
    case "zalando": return new ZalandoAdapter(cfg);
    default: throw new Error(`Unknown source kind: ${cfg.kind}`);
  }
}

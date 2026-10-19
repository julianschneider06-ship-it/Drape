// Zalando adapter STUB. en.zalando.de blocks automated access (Akamai bot protection, 403 even on robots.txt),
// so this stays inactive. Plan: use an official partner/affiliate feed instead of crawling.
import type { Cursor, NormalizedProduct, Page, RawItem, SourceAdapter, SourceConfig } from "../types";

export class ZalandoAdapter implements SourceAdapter {
  readonly kind = "zalando";
  constructor(private cfg: SourceConfig) {}
  async fetchPage(_cursor: Cursor | null): Promise<Page> {
    throw new Error(`Zalando adapter (${this.cfg.baseUrl}) is not implemented: site blocks bots. Use a partner feed.`);
  }
  normalize(_raw: RawItem): NormalizedProduct | null {
    throw new Error("Zalando adapter is not implemented");
  }
}

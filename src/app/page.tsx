import Feed from "@/components/Feed";
import { getSettings } from "@/lib/settings";

// The shell stays static (ISR): the settings are read when it is regenerated (at most every 60 s; the read itself is cached 45 s).
export const revalidate = 60;

export default async function Home() {
  const s = await getSettings();
  return <Feed defaults={{ feed: s.feed_default, sale: s.sale_marker_enabled, icons: s.icons_enabled, search: s.search_enabled }} />;
}

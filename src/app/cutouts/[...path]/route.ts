// Cutout images served from our own domain with a one-year immutable cache (Vercel's CDN keeps them at the edge, so this
// function only runs on a cache miss). Files live in the public Supabase Storage bucket `cutouts` and have versioned names
// (v<version>/<id>-<hash of source image>.webp), so a changed image always gets a new URL and "immutable" is safe.
const STORAGE = `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://ntknoxzhljktxhsbudlr.supabase.co"}/storage/v1/object/public/cutouts`;
const NAME = /^v\d+\/\d+(-[0-9a-f]{8})?\.(webp|png)$/;

export async function GET(_req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const path = (await params).path.join("/");
  if (!NAME.test(path)) return new Response("not found", { status: 404 });
  const up = await fetch(`${STORAGE}/${path}`, { signal: AbortSignal.timeout(10_000) }).catch(() => null);
  if (!up || !up.ok) return new Response("not found", { status: up?.status === 404 ? 404 : 502, headers: { "cache-control": "public, max-age=30" } });
  return new Response(up.body, {
    headers: {
      "content-type": up.headers.get("content-type") ?? "image/webp",
      "cache-control": "public, max-age=31536000, s-maxage=31536000, immutable",
    },
  });
}

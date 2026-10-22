"use client";
import Link from "next/link";
import LikesView from "@/components/LikesView";

// Standalone /likes page (direct link); in the app the same view lives in the Likes tab of the bottom bar.
export default function LikesPage() {
  return (
    <main className="min-h-dvh bg-white px-3 pb-16">
      <header className="sticky top-0 z-10 flex items-center justify-between bg-white/90 py-3 backdrop-blur">
        <Link href="/" className="text-sm text-neutral-600">← Feed</Link>
        <h1 className="text-base font-semibold">My likes</h1>
        <span className="w-12" />
      </header>
      <LikesView />
    </main>
  );
}

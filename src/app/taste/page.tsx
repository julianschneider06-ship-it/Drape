import type { Metadata } from "next";
import TasteView from "./TasteView";

export const metadata: Metadata = { title: "Taste – Drape", robots: { index: false } };

// Debug page (not linked in the app): the taste of this device (client-held) or of ?device=<uuid> (rebuilt from the event log).
export default function TastePage() { return <TasteView />; }

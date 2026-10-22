import type { Metadata, Viewport } from "next";
import { Permanent_Marker } from "next/font/google";
import "./globals.css";

// free kid-marker font for the red SALE label (same hand-drawn style as the outline)
const marker = Permanent_Marker({ weight: "400", subsets: ["latin"], display: "swap", variable: "--font-marker" });

export const metadata: Metadata = {
  title: "Drape",
  description: "Entdecke Mode in einem personalisierten Outfit-Feed.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#ffffff",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="de">
      <body className={marker.variable}>{children}</body>
    </html>
  );
}

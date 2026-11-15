"use client";
import { useEffect, useState } from "react";
import { Analytics } from "@vercel/analytics/next";
import { trackingAllowed } from "@/lib/analytics-guard";
import { debugOn } from "@/lib/debug-link";

/** Vercel Web Analytics (cookieless): only for real browsers and never on ?debug=1 sessions */
export default function AnalyticsGate() {
  const [on, setOn] = useState(false);
  useEffect(() => { try { setOn(trackingAllowed(navigator) && !debugOn(location.search)); } catch { /* nothing */ } }, []);
  return on ? <Analytics /> : null;
}

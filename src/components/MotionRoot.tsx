"use client";
import { LazyMotion } from "motion/react";

const features = () => import("@/lib/motion-features").then((m) => m.default);

/** One provider for all menu / overlay animations (`m` components from "motion/react-m"); the feature bundle loads lazily. */
export default function MotionRoot({ children }: { children: React.ReactNode }) {
  return <LazyMotion features={features} strict>{children}</LazyMotion>;
}

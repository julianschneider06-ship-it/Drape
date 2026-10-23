"use client";
import { useEffect, useState } from "react";
import { debugOn } from "@/lib/debug-link";
import { getDeviceId } from "@/lib/client/device";

/** the line itself (grey, selectable so it can be copied) */
export function DeviceDebugLine({ id }: { id: string }) {
  return <p className="select-text break-all py-4 text-center text-[11px] text-neutral-300" data-testid="device-debug">{id}</p>;
}

/** Profile page only, only with ?debug=1: shows this device's id (for the owner's test devices, see app_settings.popularity_exclude_devices). Without the parameter it renders nothing. */
export default function DeviceDebug() {
  const [id, setId] = useState<string | null>(null);
  useEffect(() => { try { if (debugOn(location.search)) setId(getDeviceId()); } catch { /* blocked storage: show nothing */ } }, []);
  return id ? <DeviceDebugLine id={id} /> : null;
}

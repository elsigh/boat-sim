"use client";

import type { useRocheCeremony } from "@/hooks/useRocheCeremony";
import { helmCssVars, helmThemeFor } from "@/lib/boats/helm-theme";
import type { BoatProfile } from "@/lib/boats/catalog";
import { HelmButton } from "./helm/Controls";

const captions = {
  preparing: "The harbor is gathering…",
  taps: "Taps carries across the water.",
  cannon: "The cannon salute.",
  horns: "The boats answer across the harbor.",
  complete: "Welcome to Roche Harbor. Lines made fast.",
};
export function RocheCeremonyNotice({ ceremony, audioEnabled, onEnableAudio, boat }: {
  ceremony: ReturnType<typeof useRocheCeremony>; audioEnabled: boolean; onEnableAudio: () => void;
  boat: BoatProfile;
}) {
  if (!ceremony.visible) return null;
  return <aside data-roche-ceremony={ceremony.stage}
    aria-label="Roche Harbor docking ceremony"
    className="absolute bottom-36 left-1/2 z-30 w-[25rem] max-w-[calc(100%-2rem)] -translate-x-1/2 rounded-xl px-5 py-4 text-center shadow-xl"
    style={{ ...helmCssVars(helmThemeFor(boat)), background: "var(--helm-face)", border: "1px solid var(--helm-edge)", color: "var(--helm-text)", fontFamily: "var(--helm-font-body)" }}>
    <p className="text-[0.62rem] uppercase tracking-[0.26em]" style={{ color: "var(--helm-accent)" }}>Roche Harbor · Colors ceremony</p>
    <p className="mt-1.5 text-lg" style={{ fontFamily: "var(--helm-font-label)" }}>Welcome to the harbor</p>
    <p role="status" className="mt-1 text-xs" style={{ color: "var(--helm-text-dim)" }}>{ceremony.error || captions[ceremony.stage]}</p>
    <div className="mt-3 flex flex-wrap justify-center gap-2">
      {!audioEnabled ? <HelmButton size="sm" onClick={onEnableAudio}>Enable sound</HelmButton> : null}
      {ceremony.stage === "complete" || ceremony.error ? <HelmButton size="sm" onClick={ceremony.replay}>Replay ceremony</HelmButton> : null}
      <HelmButton size="sm" onClick={ceremony.dismiss}>{ceremony.stage === "complete" ? "Continue" : "Skip ceremony"}</HelmButton>
    </div>
  </aside>;
}

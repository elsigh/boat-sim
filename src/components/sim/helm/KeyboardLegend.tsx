"use client";

import { useId, useRef, useState } from "react";
import { HelmButton } from "./Controls";

const SHORTCUTS = [
  { keys: ["W", "S"], action: "Port throttle · ahead / astern" },
  { keys: ["I", "K"], action: "Starboard throttle · ahead / astern" },
  { keys: ["A", "D"], action: "Bow thruster · port / starboard" },
  { keys: ["Space"], action: "Neutral both keyboard levers" },
  { keys: ["T"], action: "Toggle turbo · full ahead only" },
  { keys: ["H"], action: "Show / hide instruments" },
  { keys: ["↓", "↑"], action: "Pay out / retrieve anchor chain" },
];

export function KeyboardLegend() {
  const id = useId();
  const titleId = useId();
  const popoverRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  return <>
    <HelmButton size="sm" tone="accent" active={open}
      ariaLabel="Keyboard shortcuts" title="Keyboard shortcuts"
      popoverTarget={id} ariaControls={id} ariaExpanded={open}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="2" y="5" width="20" height="14" rx="3" />
        <path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M6 12h.01M10 12h.01M14 12h.01M18 12h.01M7 15h10" />
      </svg>
    </HelmButton>
    <div id={id} ref={popoverRef} popover="auto" role="dialog" aria-labelledby={titleId}
      onToggle={(event) => setOpen(event.newState === "open")}
      onKeyDown={(event) => event.stopPropagation()}
      className="pointer-events-auto fixed bottom-auto left-auto right-3 top-16 m-0 max-h-[calc(100dvh-5rem)] w-[22rem] max-w-[calc(100vw-1.5rem)] overflow-y-auto rounded-xl border p-4 shadow-2xl lg:right-4"
      style={{ color: "var(--helm-text)", background: "var(--helm-face)", borderColor: "var(--helm-edge)" }}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 id={titleId} className="text-sm font-semibold">Keyboard shortcuts</h2>
        <HelmButton size="sm" ariaLabel="Close keyboard shortcuts" onClick={() => popoverRef.current?.hidePopover()}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6" /></svg>
        </HelmButton>
      </div>
      <dl className="space-y-2.5 text-xs">
        {SHORTCUTS.map(({ keys, action }) => <div key={action} className="flex items-center gap-3">
          <dt className="flex w-[4.6rem] shrink-0 gap-1">
            {keys.map((key) => <kbd key={key} className="min-w-6 rounded border px-1.5 py-1 text-center font-mono text-[11px] leading-none"
              style={{ borderColor: "var(--helm-inset-edge)", background: "var(--helm-inset)" }}>{key}</kbd>)}
          </dt>
          <dd>{action}</dd>
        </div>)}
      </dl>
      <div className="mt-4 space-y-2 border-t pt-3 text-xs leading-relaxed" style={{ color: "var(--helm-text-dim)", borderColor: "var(--helm-inset-edge)" }}>
        <p>Hold throttle keys to move the levers. Release to keep their position; bow thrust stops when released.</p>
        <p>Turbo: start the engines, push fully ahead, then press T or each Thrustmaster handle’s side button. Each engine can reach 20,000 RPM. Pulling back or restarting clears turbo.</p>
        <p>Drag the scene to look around. Scroll in Top view to zoom.</p>
      </div>
    </div>
  </>;
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ceremonyStage, ceremonyTiming, scheduleRocheCeremony, type CeremonyStage } from "@/lib/sim/roche-ceremony";

export function useRocheCeremony({ enabled, active, celebrationId, audioEnabled, getAudioContext }: {
  enabled: boolean; active: boolean; celebrationId: number; audioEnabled: boolean;
  getAudioContext: () => AudioContext | null;
}) {
  const [buffer, setBuffer] = useState<AudioBuffer | null>(null);
  const [error, setError] = useState("");
  const [replay, setReplay] = useState(0);
  const [retry, setRetry] = useState(0);
  const [stage, setStage] = useState<CeremonyStage>("preparing");
  const [dismissed, setDismissed] = useState(false);
  const elapsedRef = useRef(-1);
  const startRef = useRef<number | null>(null);
  const visible = enabled && active && !dismissed;

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const context = getAudioContext();
    if (!context) { setError("Audio is unavailable in this browser."); return; }
    setError("");
    void fetch("/audio/taps-us-army.mp3", { signal: controller.signal })
      .then((response) => { if (!response.ok) throw new Error("Taps could not load."); return response.arrayBuffer(); })
      .then((bytes) => context.decodeAudioData(bytes))
      .then((decoded) => { if (!controller.signal.aborted) setBuffer(decoded); })
      .catch(() => { if (!controller.signal.aborted) setError("Taps could not load. Replay to try again."); });
    return () => controller.abort();
  }, [enabled, getAudioContext, retry]);

  useEffect(() => { setDismissed(false); }, [celebrationId, active]);

  useEffect(() => {
    elapsedRef.current = -1; startRef.current = null; setStage("preparing");
    if (!visible || !buffer) return;
    startRef.current = performance.now(); elapsedRef.current = 0; setStage("taps");
    const timer = window.setInterval(() => {
      const elapsed = (performance.now() - startRef.current!) / 1000;
      elapsedRef.current = elapsed;
      setStage(ceremonyStage(elapsed, buffer.duration));
      if (elapsed >= ceremonyTiming(buffer.duration).duration) window.clearInterval(timer);
    }, 100);
    return () => { window.clearInterval(timer); startRef.current = null; elapsedRef.current = -1; };
  }, [visible, celebrationId, replay, buffer]);

  useEffect(() => {
    const context = getAudioContext();
    if (!visible || !buffer || !audioEnabled || !context || startRef.current === null) return;
    const elapsed = (performance.now() - startRef.current) / 1000;
    const remaining = ceremonyTiming(buffer.duration).duration - elapsed;
    if (remaining <= 0) return;
    const stop = scheduleRocheCeremony(context, buffer, elapsed);
    const timer = window.setTimeout(stop, remaining * 1000);
    return () => { window.clearTimeout(timer); stop(); };
  }, [visible, celebrationId, replay, buffer, audioEnabled, getAudioContext]);

  const replayCeremony = useCallback(() => {
    setDismissed(false);
    setReplay((r) => r + 1);
    if (error) setRetry((r) => r + 1);
  }, [error]);
  const dismiss = useCallback(() => setDismissed(true), []);

  return { visible, stage, error, elapsedRef, tapsDuration: buffer?.duration ?? 59,
    replay: replayCeremony, dismiss,
  };
}

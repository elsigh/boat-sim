"use client";

import { useEffect, useRef } from "react";
import type { ImpactIncident } from "@/lib/sim/collision-damage";
import { impactPresentation } from "@/lib/sim/impact-presentation";
import type { VesselDamage } from "@/lib/sim/vessel-damage";

type SoundRig = {
  context: AudioContext; output: GainNode; limiter: DynamicsCompressorNode;
  noise: AudioBuffer; sources: Set<AudioScheduledSourceNode>; nodes: Set<AudioNode>;
};

function createRig(context: AudioContext): SoundRig {
  const output = context.createGain(), limiter = context.createDynamicsCompressor();
  output.gain.value = 0.55;
  limiter.threshold.value = -10; limiter.knee.value = 8; limiter.ratio.value = 8;
  limiter.attack.value = 0.003; limiter.release.value = 0.18;
  output.connect(limiter); limiter.connect(context.destination);
  const noise = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return { context, output, limiter, noise, sources: new Set(), nodes: new Set() };
}

function noiseBurst(rig: SoundRig, at: number, duration: number, volume: number, frequency: number, type: BiquadFilterType = "lowpass") {
  const source = rig.context.createBufferSource(), filter = rig.context.createBiquadFilter(), gain = rig.context.createGain();
  source.buffer = rig.noise; filter.type = type; filter.frequency.value = frequency; filter.Q.value = 0.7;
  gain.gain.setValueAtTime(0.0001, at); gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), at + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  source.connect(filter); filter.connect(gain); gain.connect(rig.output);
  rig.sources.add(source); rig.nodes.add(filter); rig.nodes.add(gain);
  source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); rig.sources.delete(source); rig.nodes.delete(filter); rig.nodes.delete(gain); };
  source.start(at); source.stop(at + duration + 0.02);
}

function impactSound(rig: SoundRig, hit: ImpactIncident) {
  const t = rig.context.currentTime;
  const strength = impactPresentation(hit).power;
  const oscillator = rig.context.createOscillator(), gain = rig.context.createGain();
  oscillator.frequency.setValueAtTime(110, t); oscillator.frequency.exponentialRampToValueAtTime(32, t + 0.32);
  gain.gain.setValueAtTime(strength * 0.7, t); gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
  oscillator.connect(gain); gain.connect(rig.output); rig.sources.add(oscillator); rig.nodes.add(gain);
  oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); rig.sources.delete(oscillator); rig.nodes.delete(gain); };
  oscillator.start(t); oscillator.stop(t + 0.65);
  const wood = hit.surface === "dock" || hit.surface === "piling";
  noiseBurst(rig, t, 0.2 + strength * 0.65, strength * 0.5, wood ? 1700 : 800, "bandpass");
  if (strength >= 0.6) {
    for (let i = 0; i < Math.ceil(5 + strength * 3); i++) noiseBurst(rig, t + 0.045 + i * 0.072, 0.1, strength * 0.3 * Math.exp(-i * 0.22), wood ? 2600 : 3800, "highpass");
    noiseBurst(rig, t + 0.35, 1.45, strength * 0.4, 950);
    noiseBurst(rig, t + 0.9, 0.75, strength * 0.2, 1900);
  }
}

function silence(rig: SoundRig) {
  for (const source of rig.sources) { source.onended = null; try { source.stop(); } catch { /* already ended */ } source.disconnect(); }
  for (const node of rig.nodes) node.disconnect();
  rig.sources.clear(); rig.nodes.clear();
}

export function useCollisionAudio({ incidents, damage, audioEnabled, paused, getAudioContext }: {
  incidents: ImpactIncident[]; damage: VesselDamage; audioEnabled: boolean; paused: boolean; getAudioContext: () => AudioContext | null;
}) {
  const rigRef = useRef<SoundRig | null>(null), played = useRef(0);
  const fireStrength = useRef(0);
  const latest = incidents.at(-1);
  useEffect(() => {
    const context = getAudioContext();
    if (context && !rigRef.current) rigRef.current = createRig(context);
    const rig = rigRef.current;
    if (!rig) return;
    if (!audioEnabled || paused || !latest) silence(rig);
    rig.output.gain.setTargetAtTime(audioEnabled && !paused ? 0.55 : 0, context!.currentTime, 0.02);
    if (latest && latest.id > played.current) {
      const fresh = incidents.filter((hit) => hit.id > played.current);
      played.current = latest.id;
      if (audioEnabled && !paused && context!.state === "running") {
        // Several bays can fail in one step. Layer a bounded burst instead of
        // silently dropping every impact except the last React update.
        for (const hit of fresh.slice(-3)) if (rig.sources.size < 80) impactSound(rig, hit);
      }
    }
  }, [audioEnabled, paused, latest, incidents, getAudioContext]);

  useEffect(() => {
    const increase = damage.fire - fireStrength.current;
    fireStrength.current = damage.fire;
    const rig = rigRef.current;
    if (increase > 0.1 && rig && audioEnabled && !paused && rig.context.state === "running") {
      const t = rig.context.currentTime;
      noiseBurst(rig, t, 0.85, damage.fire * 0.55, 320);
      noiseBurst(rig, t + 0.05, 1.2, damage.fire * 0.3, 1100, "bandpass");
    }
  }, [damage.fire, audioEnabled, paused]);

  const fireAudible = damage.fire > 0.01, floodingAudible = damage.breach > 0 && damage.sinking < 1;
  useEffect(() => {
    if (!audioEnabled || paused || (!fireAudible && !floodingAudible)) return;
    const timer = window.setInterval(() => {
      const rig = rigRef.current;
      if (!rig || rig.context.state !== "running") return;
      const t = rig.context.currentTime;
      if (fireAudible) {
        const strength = fireStrength.current;
        noiseBurst(rig, t, 1.05, strength * 0.16, 480);
        for (let i = 0; i < 3; i++) noiseBurst(rig, t + i * 0.23, 0.12, strength * (0.08 + Math.random() * 0.06), 1800 + Math.random() * 1500, "highpass");
      }
      if (floodingAudible) noiseBurst(rig, t, 1.1, 0.065, 380);
    }, 850);
    return () => window.clearInterval(timer);
  }, [audioEnabled, paused, fireAudible, floodingAudible]);

  useEffect(() => () => {
    const rig = rigRef.current;
    if (rig) { silence(rig); rig.output.disconnect(); rig.limiter.disconnect(); }
    rigRef.current = null;
  }, []);
}

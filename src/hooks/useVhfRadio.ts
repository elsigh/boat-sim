"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Synthesized VHF harbor-channel ambience: squelch hiss, then intermittent
// garbled transmissions — a narrow-band "voice" (jittered sawtooth through a
// telephone-ish bandpass, chopped by a syllable envelope) opened and closed
// by squelch clicks. No samples; everything is WebAudio.

const VHF_MONITORING_STORAGE_KEY = "boat-sim:vhf-monitoring";
const MASTER_GAIN = 0.16;
const NEXT_TRANSMISSION_DELAY_MS: [number, number] = [6_000, 22_000];

type RadioRig = {
  context: AudioContext;
  master: GainNode;
  hissGain: GainNode;
  noiseSource: AudioBufferSourceNode;
  noiseOutput: GainNode;
  timers: Set<number>;
};

export type VhfRadioState = {
  monitoring: boolean;
  supported: boolean;
  /** True while a transmission is coming through — drives the RX light. */
  receiving: boolean;
  toggleMonitoring: () => void;
};

function readMonitoringPreference() {
  try {
    return window.localStorage.getItem(VHF_MONITORING_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function writeMonitoringPreference(monitoring: boolean) {
  try {
    window.localStorage.setItem(
      VHF_MONITORING_STORAGE_KEY,
      monitoring ? "true" : "false",
    );
  } catch {
    // Storage failures shouldn't break the radio.
  }
}

function createNoiseBuffer(context: AudioContext) {
  const length = context.sampleRate * 2;
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);

  for (let index = 0; index < length; index += 1) {
    data[index] = Math.random() * 2 - 1;
  }

  return buffer;
}

function randomBetween(range: [number, number]) {
  return range[0] + Math.random() * (range[1] - range[0]);
}

/** Short burst of band-limited noise — the squelch opening/closing click. */
function playSquelchClick(rig: RadioRig, at: number, level = 0.5) {
  const { context, master } = rig;
  const gain = context.createGain();
  const filter = context.createBiquadFilter();

  filter.type = "bandpass";
  filter.frequency.value = 1600;
  filter.Q.value = 0.7;

  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(level, at + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.001, at + 0.09);

  rig.noiseOutput.connect(filter);
  filter.connect(gain);
  gain.connect(master);

  const cleanup = window.setTimeout(() => {
    rig.noiseOutput.disconnect(filter);
    filter.disconnect();
    gain.disconnect();
    rig.timers.delete(cleanup);
  }, (at - context.currentTime + 0.4) * 1000);
  rig.timers.add(cleanup);
}

/**
 * One garbled voice transmission. Returns its duration in seconds so the
 * scheduler can light the RX indicator for the right window.
 */
function playTransmission(rig: RadioRig): number {
  const { context, master } = rig;
  const now = context.currentTime;
  const durationS = 1.4 + Math.random() * 3.2;

  playSquelchClick(rig, now, 0.4);

  // Voice source: sawtooth with pitch jitter, plus carrier noise underneath.
  const voice = context.createOscillator();
  voice.type = "sawtooth";
  const basePitch = 96 + Math.random() * 110;
  voice.frequency.value = basePitch;

  const jitter = context.createOscillator();
  jitter.frequency.value = 4.2 + Math.random() * 3;
  const jitterDepth = context.createGain();
  jitterDepth.gain.value = basePitch * 0.16;
  jitter.connect(jitterDepth);
  jitterDepth.connect(voice.frequency);

  const voiceGain = context.createGain();
  voiceGain.gain.value = 0;

  const noiseBedGain = context.createGain();
  noiseBedGain.gain.value = 0.12;
  rig.noiseOutput.connect(noiseBedGain);

  // Narrow VHF audio band, then a hard clip for that compressed radio sound.
  const band = context.createBiquadFilter();
  band.type = "bandpass";
  band.frequency.value = 1100;
  band.Q.value = 0.85;

  const shaper = context.createWaveShaper();
  const curve = new Float32Array(64);

  for (let index = 0; index < curve.length; index += 1) {
    const x = (index / (curve.length - 1)) * 2 - 1;
    curve[index] = Math.tanh(x * 3.2);
  }

  shaper.curve = curve;

  const txGain = context.createGain();
  txGain.gain.setValueAtTime(0.5, now);

  voice.connect(voiceGain);
  voiceGain.connect(band);
  noiseBedGain.connect(band);
  band.connect(shaper);
  shaper.connect(txGain);
  txGain.connect(master);

  // Syllable envelope: bursts with word-gaps, riding on the voice gain.
  let cursor = now + 0.1;
  const end = now + durationS - 0.15;

  while (cursor < end) {
    const syllableLength = 0.09 + Math.random() * 0.16;
    const level = 0.35 + Math.random() * 0.5;

    voiceGain.gain.setTargetAtTime(level, cursor, 0.025);
    voiceGain.gain.setTargetAtTime(0.02, cursor + syllableLength, 0.03);
    cursor += syllableLength + 0.04 + Math.random() * 0.1;

    // Word gap, occasionally a longer pause.
    if (Math.random() < 0.28) {
      cursor += 0.14 + Math.random() * 0.3;
    }

    // Drift the pitch like speech intonation.
    voice.frequency.setTargetAtTime(
      basePitch * (0.85 + Math.random() * 0.35),
      cursor,
      0.08,
    );
  }

  voiceGain.gain.setTargetAtTime(0, end, 0.04);
  playSquelchClick(rig, now + durationS - 0.05, 0.55);

  voice.start(now);
  jitter.start(now);
  voice.stop(now + durationS + 0.3);
  jitter.stop(now + durationS + 0.3);

  const cleanup = window.setTimeout(() => {
    rig.noiseOutput.disconnect(noiseBedGain);
    noiseBedGain.disconnect();
    voiceGain.disconnect();
    band.disconnect();
    shaper.disconnect();
    txGain.disconnect();
    rig.timers.delete(cleanup);
  }, (durationS + 0.6) * 1000);
  rig.timers.add(cleanup);

  return durationS;
}

export function useVhfRadio(): VhfRadioState {
  const [monitoring, setMonitoring] = useState(false);
  const [receiving, setReceiving] = useState(false);
  const [supported, setSupported] = useState(true);
  const rigRef = useRef<RadioRig | null>(null);

  const teardown = useCallback(() => {
    const rig = rigRef.current;

    if (!rig) {
      return;
    }

    rig.timers.forEach((timer) => window.clearTimeout(timer));
    rig.timers.clear();

    try {
      rig.noiseSource.stop();
    } catch {
      // Already stopped.
    }

    void rig.context.close().catch(() => undefined);
    rigRef.current = null;
    setReceiving(false);
  }, []);

  const startRig = useCallback(() => {
    // Never build a second rig — a leaked one keeps hissing forever.
    if (rigRef.current) {
      return;
    }

    const AudioContextImpl =
      typeof window !== "undefined"
        ? (window.AudioContext ||
            (window as Window & { webkitAudioContext?: typeof AudioContext })
              .webkitAudioContext)
        : undefined;

    if (!AudioContextImpl) {
      setSupported(false);
      return;
    }

    const context = new AudioContextImpl();
    const master = context.createGain();
    master.gain.value = MASTER_GAIN;
    master.connect(context.destination);

    // Continuous faint squelch-floor hiss so the radio feels alive.
    const noiseSource = context.createBufferSource();
    noiseSource.buffer = createNoiseBuffer(context);
    noiseSource.loop = true;

    const noiseOutput = context.createGain();
    noiseOutput.gain.value = 1;
    noiseSource.connect(noiseOutput);

    const hissFilter = context.createBiquadFilter();
    hissFilter.type = "bandpass";
    hissFilter.frequency.value = 2200;
    hissFilter.Q.value = 0.4;

    const hissGain = context.createGain();
    hissGain.gain.value = 0.035;

    noiseOutput.connect(hissFilter);
    hissFilter.connect(hissGain);
    hissGain.connect(master);

    noiseSource.start();

    const rig: RadioRig = {
      context,
      master,
      hissGain,
      noiseSource,
      noiseOutput,
      timers: new Set(),
    };

    rigRef.current = rig;
    void context.resume();

    const scheduleNext = (delayMs: number) => {
      const timer = window.setTimeout(() => {
        rig.timers.delete(timer);

        if (rigRef.current !== rig) {
          return;
        }

        const durationS = playTransmission(rig);
        setReceiving(true);

        const rxOff = window.setTimeout(() => {
          rig.timers.delete(rxOff);
          setReceiving(false);
        }, durationS * 1000);
        rig.timers.add(rxOff);

        // Sometimes the reply comes right back; otherwise a quiet stretch.
        const reply = Math.random() < 0.35;
        scheduleNext(
          durationS * 1000 +
            (reply ? 700 + Math.random() * 1500 : randomBetween(NEXT_TRANSMISSION_DELAY_MS)),
        );
      }, delayMs);
      rig.timers.add(timer);
    };

    // First traffic comes quickly so switching the radio on feels rewarded.
    scheduleNext(1500 + Math.random() * 3500);
  }, []);

  const toggleMonitoring = useCallback(() => {
    // Side effects stay OUT of the state updater: React may invoke updaters
    // more than once, and a double startRig() leaks an audio graph that keeps
    // crackling after the radio reads "off".
    const next = !monitoringRef.current;

    monitoringRef.current = next;
    setMonitoring(next);
    writeMonitoringPreference(next);

    if (next) {
      startRig();
    } else {
      teardown();
    }
  }, [startRig, teardown]);

  // Restore a saved "monitoring" preference. Browsers refuse audio before a
  // user gesture, so the rig itself waits for the first pointer/key input.
  const monitoringRef = useRef(monitoring);

  useEffect(() => {
    monitoringRef.current = monitoring;
  }, [monitoring]);

  useEffect(() => {
    if (readMonitoringPreference()) {
      setMonitoring(true);
      monitoringRef.current = true;
    }

    const startOnGesture = () => {
      if (monitoringRef.current && !rigRef.current) {
        startRig();
      }

      window.removeEventListener("pointerdown", startOnGesture);
      window.removeEventListener("keydown", startOnGesture);
    };

    window.addEventListener("pointerdown", startOnGesture);
    window.addEventListener("keydown", startOnGesture);

    return () => {
      window.removeEventListener("pointerdown", startOnGesture);
      window.removeEventListener("keydown", startOnGesture);
      teardown();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { monitoring, supported, receiving, toggleMonitoring };
}

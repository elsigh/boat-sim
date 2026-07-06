"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { TwinEngineState } from "@/hooks/useEngineState";

type EngineVoice = {
  outputGain: GainNode;
  starterGain: GainNode;
  starterOsc: OscillatorNode;
  /** Combustion rumble: noise + low fundamental, gated by the firing pulses. */
  combustionGain: GainNode;
  combustionFilter: BiquadFilterNode;
  fundOsc: OscillatorNode;
  fundGain: GainNode;
  /** Exhaust burble band, ungated. */
  exhaustGain: GainNode;
  /** Pulse train at cylinder-firing rate that chops the combustion bus. */
  pulseOsc: OscillatorNode;
  wobbleOsc: OscillatorNode;
  noiseSources: AudioBufferSourceNode[];
  /** Per-engine firing-rate offset so the twins drift in and out of sync. */
  firingOffsetHz: number;
};

type EngineAudioRig = {
  context: AudioContext;
  port: EngineVoice;
  starboard: EngineVoice;
};

const AUDIO_MUTED_STORAGE_KEY = "boat-sim:audio-muted";

function readMutedPreference() {
  try {
    return window.localStorage.getItem(AUDIO_MUTED_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function writeMutedPreference(muted: boolean) {
  try {
    window.localStorage.setItem(AUDIO_MUTED_STORAGE_KEY, muted ? "true" : "false");
  } catch {
    // Ignore storage failures and keep audio functional.
  }
}

export type EngineAudioState = {
  audioEnabled: boolean;
  audioSupported: boolean;
  enableAudio: (nextEnabled?: boolean) => void;
};

function setTarget(param: AudioParam, value: number, time: number, slew = 0.08) {
  param.cancelScheduledValues(time);
  param.setTargetAtTime(value, time, slew);
}

function createNoiseBuffer(context: AudioContext) {
  const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
  const channel = buffer.getChannelData(0);
  let last = 0;

  // Brown-ish noise: integrate white noise for a deep, rumbly spectrum.
  for (let index = 0; index < channel.length; index += 1) {
    const white = Math.random() * 2 - 1;
    last = (last + 0.02 * white) / 1.02;
    channel[index] = last * 3.2;
  }

  return buffer;
}

// The chug: everything combustion-flavored passes through a gain node whose
// gain is chopped at cylinder-firing rate by a shaped pulse train. At idle the
// firing rate sits low enough (~11 Hz) that individual pulses read as
// "putt putt putt"; opening the throttle raises the rate, the filter
// brightness, and the exhaust burble together.
const IDLE_FIRING_HZ = 11;
const FULL_FIRING_HZ = 34;

function createPulseCurve() {
  const samples = 1024;
  const curve = new Float32Array(samples);

  for (let index = 0; index < samples; index += 1) {
    const x = index / (samples - 1);
    // Narrow positive lobes with a soft floor between firings.
    curve[index] = 0.22 + 0.78 * Math.pow(x, 5);
  }

  return curve;
}

function createEngineVoice(
  context: AudioContext,
  pan: number,
  noiseBuffer: AudioBuffer,
  firingOffsetHz: number,
  wobbleRateHz: number,
): EngineVoice {
  const panner = context.createStereoPanner();
  panner.pan.value = pan;

  const outputGain = context.createGain();
  outputGain.gain.value = 0.0001;
  outputGain.connect(panner);
  panner.connect(context.destination);

  // Combustion bus, gated by the firing pulse train.
  const chugGain = context.createGain();
  chugGain.gain.value = 0.0001;
  chugGain.connect(outputGain);

  const pulseOsc = context.createOscillator();
  pulseOsc.type = "sine";
  pulseOsc.frequency.value = IDLE_FIRING_HZ + firingOffsetHz;
  const pulseShaper = context.createWaveShaper();
  pulseShaper.curve = createPulseCurve();
  const pulseDepth = context.createGain();
  pulseDepth.gain.value = 1;
  pulseOsc.connect(pulseShaper);
  pulseShaper.connect(pulseDepth);
  pulseDepth.connect(chugGain.gain);

  // Slow RPM wobble so the beat never sits perfectly steady.
  const wobbleOsc = context.createOscillator();
  wobbleOsc.type = "sine";
  wobbleOsc.frequency.value = wobbleRateHz;
  const wobbleDepth = context.createGain();
  wobbleDepth.gain.value = 0.35;
  wobbleOsc.connect(wobbleDepth);
  wobbleDepth.connect(pulseOsc.frequency);

  // Combustion rumble: brown-ish noise through a low lowpass.
  const combustionSource = context.createBufferSource();
  combustionSource.buffer = noiseBuffer;
  combustionSource.loop = true;
  const combustionFilter = context.createBiquadFilter();
  combustionFilter.type = "lowpass";
  combustionFilter.frequency.value = 140;
  combustionFilter.Q.value = 0.4;
  const combustionGain = context.createGain();
  combustionGain.gain.value = 0.0001;
  combustionSource.connect(combustionFilter);
  combustionFilter.connect(combustionGain);
  combustionGain.connect(chugGain);

  // Low fundamental for body under the noise.
  const fundOsc = context.createOscillator();
  fundOsc.type = "triangle";
  fundOsc.frequency.value = (IDLE_FIRING_HZ + firingOffsetHz) * 2;
  const fundFilter = context.createBiquadFilter();
  fundFilter.type = "lowpass";
  fundFilter.frequency.value = 170;
  const fundGain = context.createGain();
  fundGain.gain.value = 0.0001;
  fundOsc.connect(fundFilter);
  fundFilter.connect(fundGain);
  fundGain.connect(chugGain);

  // Exhaust burble: a higher noise band, not gated, wet and steady.
  const exhaustSource = context.createBufferSource();
  exhaustSource.buffer = noiseBuffer;
  exhaustSource.loop = true;
  exhaustSource.playbackRate.value = 0.62;
  const exhaustFilter = context.createBiquadFilter();
  exhaustFilter.type = "bandpass";
  exhaustFilter.frequency.value = 330;
  exhaustFilter.Q.value = 0.5;
  const exhaustGain = context.createGain();
  exhaustGain.gain.value = 0.0001;
  exhaustSource.connect(exhaustFilter);
  exhaustFilter.connect(exhaustGain);
  exhaustGain.connect(outputGain);

  // Starter motor whirr.
  const starterOsc = context.createOscillator();
  starterOsc.type = "square";
  starterOsc.frequency.value = 16;
  const starterGain = context.createGain();
  starterGain.gain.value = 0.0001;
  const starterFilter = context.createBiquadFilter();
  starterFilter.type = "lowpass";
  starterFilter.frequency.value = 110;
  starterOsc.connect(starterGain);
  starterGain.connect(starterFilter);
  starterFilter.connect(outputGain);

  pulseOsc.start();
  wobbleOsc.start();
  fundOsc.start();
  starterOsc.start();
  combustionSource.start();
  exhaustSource.start(context.currentTime, Math.random() * 1.5);

  return {
    outputGain,
    starterGain,
    starterOsc,
    combustionGain,
    combustionFilter,
    fundOsc,
    fundGain,
    exhaustGain,
    pulseOsc,
    wobbleOsc,
    noiseSources: [combustionSource, exhaustSource],
    firingOffsetHz,
  };
}

function updateVoice(
  voice: EngineVoice,
  context: AudioContext,
  engine: TwinEngineState["port"],
) {
  const time = context.currentTime;
  const demand = Math.abs(engine.effectiveThrottle);
  const engaged = engine.starting || engine.running;
  const firingHz = engine.running
    ? IDLE_FIRING_HZ + voice.firingOffsetHz + demand * (FULL_FIRING_HZ - IDLE_FIRING_HZ)
    : 7;

  setTarget(voice.outputGain.gain, engaged ? 0.5 : 0.0001, time, 0.12);
  setTarget(voice.starterGain.gain, engine.starting ? 0.11 : 0.0001, time, 0.04);
  setTarget(voice.starterOsc.frequency, engine.starting ? 14 + demand * 4 : 10, time, 0.06);

  setTarget(voice.pulseOsc.frequency, firingHz, time, 0.09);
  setTarget(voice.fundOsc.frequency, firingHz * 2, time, 0.09);

  setTarget(
    voice.combustionGain.gain,
    engine.running ? 0.34 + demand * 0.3 : 0.0001,
    time,
    0.09,
  );
  setTarget(
    voice.combustionFilter.frequency,
    engine.running ? 130 + demand * 240 : 90,
    time,
    0.1,
  );
  setTarget(voice.fundGain.gain, engine.running ? 0.22 + demand * 0.14 : 0.0001, time, 0.09);
  setTarget(
    voice.exhaustGain.gain,
    engine.starting ? 0.02 : engine.running ? 0.025 + demand * 0.075 : 0.0001,
    time,
    0.09,
  );
}

function syncRigVoices(
  rig: EngineAudioRig,
  engineState: Pick<TwinEngineState, "port" | "starboard">,
) {
  updateVoice(rig.port, rig.context, engineState.port);
  updateVoice(rig.starboard, rig.context, engineState.starboard);
}

export function useEngineAudio(engineState: TwinEngineState): EngineAudioState {
  const rigRef = useRef<EngineAudioRig | null>(null);
  const engineStateRef = useRef(engineState);
  const userMutedRef = useRef(false);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const { ignitionPressed, port, starboard } = engineState;
  const audioSupported =
    typeof window === "undefined"
      ? true
      : Boolean(
          window.AudioContext ||
            (window as typeof window & {
              webkitAudioContext?: typeof AudioContext;
            }).webkitAudioContext,
        );

  useEffect(() => {
    engineStateRef.current = engineState;
  }, [engineState]);

  const enableAudio = useCallback((nextEnabled?: boolean) => {
    const rig = rigRef.current;

    if (!rig) {
      return;
    }

    const shouldEnable = nextEnabled ?? rig.context.state !== "running";

    if (!shouldEnable) {
      userMutedRef.current = true;
      writeMutedPreference(true);
      void rig.context.suspend().then(() => {
        setAudioEnabled(false);
      });
      return;
    }

    userMutedRef.current = false;
    writeMutedPreference(false);
    void rig.context.resume().then(() => {
      setAudioEnabled(rig.context.state === "running");
      syncRigVoices(rig, engineStateRef.current);
    });
  }, []);

  useEffect(() => {
    const AudioContextCtor =
      window.AudioContext ||
      (window as typeof window & {
        webkitAudioContext?: typeof AudioContext;
      }).webkitAudioContext;

    if (!AudioContextCtor) {
      return undefined;
    }

    userMutedRef.current = readMutedPreference();

    const context = new AudioContextCtor();
    const noiseBuffer = createNoiseBuffer(context);
    const rig: EngineAudioRig = {
      context,
      // Slightly different firing rates and wobble so the twins drift in and
      // out of sync — the classic two-diesel beat.
      port: createEngineVoice(context, -0.35, noiseBuffer, 0, 0.23),
      starboard: createEngineVoice(context, 0.35, noiseBuffer, 0.55, 0.31),
    };

    rigRef.current = rig;
    syncRigVoices(rig, engineStateRef.current);

    const unlock = () => {
      if (userMutedRef.current) {
        return;
      }

      void context.resume().then(() => {
        setAudioEnabled(context.state === "running");
        syncRigVoices(rig, engineStateRef.current);
      });
    };
    const handleStateChange = () => {
      setAudioEnabled(context.state === "running");
      syncRigVoices(rig, engineStateRef.current);
    };

    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    window.addEventListener("touchstart", unlock);
    context.addEventListener("statechange", handleStateChange);

    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      window.removeEventListener("touchstart", unlock);
      context.removeEventListener("statechange", handleStateChange);

      for (const voice of [rig.port, rig.starboard]) {
        voice.pulseOsc.stop();
        voice.wobbleOsc.stop();
        voice.fundOsc.stop();
        voice.starterOsc.stop();

        for (const source of voice.noiseSources) {
          source.stop();
        }
      }

      void context.close();
      rigRef.current = null;
    };
  }, []);

  useEffect(() => {
    const rig = rigRef.current;

    if (!rig) {
      return;
    }

    if (ignitionPressed && !userMutedRef.current) {
      void rig.context.resume().then(() => {
        setAudioEnabled(rig.context.state === "running");
        syncRigVoices(rig, engineStateRef.current);
      });
    }

    syncRigVoices(rig, { port, starboard });
  }, [ignitionPressed, port, starboard]);

  return {
    audioEnabled,
    audioSupported,
    enableAudio,
  };
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { TwinEngineState } from "@/hooks/useEngineState";

type EngineVoice = {
  outputGain: GainNode;
  lowGain: GainNode;
  highGain: GainNode;
  starterGain: GainNode;
  noiseGain: GainNode;
  lowOsc: OscillatorNode;
  highOsc: OscillatorNode;
  starterOsc: OscillatorNode;
  noiseSource: AudioBufferSourceNode;
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

  for (let index = 0; index < channel.length; index += 1) {
    channel[index] = (Math.random() * 2 - 1) * 0.45;
  }

  return buffer;
}

function createEngineVoice(context: AudioContext, pan: number, noiseBuffer: AudioBuffer): EngineVoice {
  const panner = context.createStereoPanner();
  panner.pan.value = pan;

  const outputGain = context.createGain();
  outputGain.gain.value = 0.0001;
  outputGain.connect(panner);
  panner.connect(context.destination);

  const lowOsc = context.createOscillator();
  lowOsc.type = "triangle";
  lowOsc.frequency.value = 26;
  const lowGain = context.createGain();
  lowGain.gain.value = 0.0001;
  const lowFilter = context.createBiquadFilter();
  lowFilter.type = "lowpass";
  lowFilter.frequency.value = 180;
  lowOsc.connect(lowGain);
  lowGain.connect(lowFilter);
  lowFilter.connect(outputGain);

  const highOsc = context.createOscillator();
  highOsc.type = "sawtooth";
  highOsc.frequency.value = 52;
  const highGain = context.createGain();
  highGain.gain.value = 0.0001;
  const highFilter = context.createBiquadFilter();
  highFilter.type = "bandpass";
  highFilter.frequency.value = 135;
  highFilter.Q.value = 0.8;
  highOsc.connect(highGain);
  highGain.connect(highFilter);
  highFilter.connect(outputGain);

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

  const noiseSource = context.createBufferSource();
  noiseSource.buffer = noiseBuffer;
  noiseSource.loop = true;
  const noiseGain = context.createGain();
  noiseGain.gain.value = 0.0001;
  const noiseFilter = context.createBiquadFilter();
  noiseFilter.type = "bandpass";
  noiseFilter.frequency.value = 95;
  noiseFilter.Q.value = 0.6;
  noiseSource.connect(noiseGain);
  noiseGain.connect(noiseFilter);
  noiseFilter.connect(outputGain);

  lowOsc.start();
  highOsc.start();
  starterOsc.start();
  noiseSource.start();

  return {
    outputGain,
    lowGain,
    highGain,
    starterGain,
    noiseGain,
    lowOsc,
    highOsc,
    starterOsc,
    noiseSource,
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

  setTarget(voice.outputGain.gain, engaged ? 0.32 : 0.0001, time, 0.12);
  setTarget(voice.starterGain.gain, engine.starting ? 0.11 : 0.0001, time, 0.04);
  setTarget(voice.lowGain.gain, engine.running ? 0.18 + demand * 0.08 : 0.0001, time, 0.1);
  setTarget(voice.highGain.gain, engine.running ? 0.03 + demand * 0.09 : 0.0001, time, 0.08);
  setTarget(
    voice.noiseGain.gain,
    engine.starting ? 0.035 : engine.running ? 0.02 + demand * 0.04 : 0.0001,
    time,
    0.08,
  );

  setTarget(voice.lowOsc.frequency, engine.running ? 24 + demand * 18 : 18, time, 0.1);
  setTarget(voice.highOsc.frequency, engine.running ? 50 + demand * 42 : 34, time, 0.1);
  setTarget(voice.starterOsc.frequency, engine.starting ? 14 + demand * 4 : 10, time, 0.06);
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
      port: createEngineVoice(context, -0.35, noiseBuffer),
      starboard: createEngineVoice(context, 0.35, noiseBuffer),
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

      rig.port.lowOsc.stop();
      rig.port.highOsc.stop();
      rig.port.starterOsc.stop();
      rig.port.noiseSource.stop();

      rig.starboard.lowOsc.stop();
      rig.starboard.highOsc.stop();
      rig.starboard.starterOsc.stop();
      rig.starboard.noiseSource.stop();

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

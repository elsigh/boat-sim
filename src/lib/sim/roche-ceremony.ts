export type CeremonyStage = "preparing" | "taps" | "cannon" | "horns" | "complete";

export function ceremonyTiming(tapsDuration: number) {
  const cannonAt = tapsDuration + 1.1;
  const hornsAt = cannonAt + 2.6;
  return { cannonAt, hornsAt, duration: hornsAt + 10.5 };
}
export function ceremonyStage(elapsed: number, tapsDuration: number): CeremonyStage {
  const timing = ceremonyTiming(tapsDuration);
  if (elapsed >= timing.duration) return "complete";
  if (elapsed >= timing.hornsAt) return "horns";
  if (elapsed >= timing.cannonAt) return "cannon";
  return "taps";
}

/** A bounded, stereo harbour soundscape; returning cleanup cancels every voice. */
export function scheduleRocheCeremony(context: BaseAudioContext, taps: AudioBuffer, elapsed: number) {
  const now = context.currentTime, base = now - elapsed;
  const { cannonAt, hornsAt } = ceremonyTiming(taps.duration);
  const sources: AudioScheduledSourceNode[] = [];
  const nodes: AudioNode[] = [];
  const master = context.createGain(); master.gain.value = 0.48;
  const compressor = context.createDynamicsCompressor();
  compressor.threshold.value = -15; compressor.ratio.value = 5; compressor.attack.value = 0.003;
  master.connect(compressor); compressor.connect(context.destination);
  nodes.push(master, compressor);

  const echo = context.createDelay(2); echo.delayTime.value = 0.42;
  const wet = context.createGain(); wet.gain.value = 0.16;
  const dull = context.createBiquadFilter(); dull.type = "lowpass"; dull.frequency.value = 1600;
  master.connect(echo); echo.connect(dull); dull.connect(wet); wet.connect(compressor);
  nodes.push(echo, wet, dull);

  if (elapsed < taps.duration) {
    const source = context.createBufferSource(); source.buffer = taps;
    const filter = context.createBiquadFilter(); filter.type = "lowpass"; filter.frequency.value = 4200;
    const gain = context.createGain(); gain.gain.value = 0.7;
    source.connect(filter); filter.connect(gain); gain.connect(master);
    source.start(now, Math.max(0, elapsed)); sources.push(source); nodes.push(source, filter, gain);
  }
  if (elapsed <= cannonAt) {
    const at = base + cannonAt;
    const source = context.createBufferSource();
    const buffer = context.createBuffer(1, context.sampleRate * 2.8, context.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0, seed = 1937;
    for (let i = 0; i < data.length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const white = seed / 2147483648 - 1;
      last = (last + white * 0.05) / 1.05;
      const t = i / context.sampleRate;
      data[i] = white * Math.exp(-t * 35) * 0.5 + last * Math.exp(-t * 2.8) * 2.8;
    }
    source.buffer = buffer;
    const gain = context.createGain(); gain.gain.value = 0.7;
    source.connect(gain); gain.connect(master); source.start(at);
    sources.push(source); nodes.push(source, gain);
    const boom = context.createOscillator(); boom.type = "sine";
    boom.frequency.setValueAtTime(86, at); boom.frequency.exponentialRampToValueAtTime(30, at + 1.1);
    const envelope = context.createGain(); envelope.gain.setValueAtTime(0.45, at);
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + 1.7);
    boom.connect(envelope); envelope.connect(master); boom.start(at); boom.stop(at + 1.8);
    sources.push(boom); nodes.push(boom, envelope);
  }
  const horns = [
    [0, 2.8, 146.83, -0.7], [0.85, 1.5, 220, 0.55], [2.1, 3.1, 110, 0.25],
    [3.5, 1.15, 293.66, -0.25], [4.7, 2.4, 174.61, 0.8], [6.5, 2.1, 130.81, -0.6],
  ];
  for (const [offset, duration, frequency, pan] of horns) {
    const start = hornsAt + offset;
    if (elapsed >= start + duration) continue;
    const at = Math.max(now, base + start), end = base + start + duration;
    const envelope = context.createGain();
    envelope.gain.setValueAtTime(0.0001, at);
    envelope.gain.linearRampToValueAtTime(0.17, Math.min(at + 0.15, end));
    envelope.gain.setTargetAtTime(0.0001, Math.max(at + 0.15, end - 0.2), 0.07);
    const panner = context.createStereoPanner(); panner.pan.value = pan;
    const filter = context.createBiquadFilter(); filter.type = "lowpass"; filter.frequency.value = 1100;
    envelope.connect(filter); filter.connect(panner); panner.connect(master);
    nodes.push(envelope, panner, filter);
    for (const detune of [-5, 5]) {
      const voice = context.createOscillator(); voice.type = "sawtooth";
      voice.frequency.setValueAtTime(frequency * 0.96, at);
      voice.frequency.exponentialRampToValueAtTime(frequency, Math.min(at + 0.2, end));
      voice.detune.value = detune;
      voice.connect(envelope); voice.start(at); voice.stop(Math.max(at + 0.01, end + 0.1));
      sources.push(voice); nodes.push(voice);
    }
  }
  return () => {
    for (const source of sources) { try { source.stop(); } catch { /* Already finished. */ } }
    for (const node of nodes) node.disconnect();
  };
}

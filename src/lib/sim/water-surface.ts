import type { SimulationEnvironment } from "./boat-physics";

export const WATER_LEVEL = -0.05;
// Small sheltered-water wave components: metres, radians, seconds. Shared by
// shading and the hull's visual heave so boat and water answer the same sea.
export const WATER_WAVES = [
  { wavelength: 12, amplitude: 1, angle: 0 },
  { wavelength: 5.1, amplitude: 0.38, angle: 0.65 },
  { wavelength: 2.3, amplitude: 0.14, angle: -0.48 },
] as const;

export function waterAmplitude(environment: SimulationEnvironment) {
  return 0.018 + Math.min(0.13, environment.windVelocity.length() * 0.014);
}

export function sampleWaterHeight(x: number, z: number, time: number, environment: SimulationEnvironment) {
  const wind = environment.windVelocity;
  const heading = wind.lengthSq() > 0.001 ? Math.atan2(wind.z, wind.x) : 0.4;
  const px = x - environment.currentVelocity.x * time;
  const pz = z - environment.currentVelocity.z * time;
  let height = 0;
  for (const wave of WATER_WAVES) {
    const k = 2 * Math.PI / wave.wavelength;
    const phase = k * (px * Math.cos(heading + wave.angle) + pz * Math.sin(heading + wave.angle)) - Math.sqrt(9.81 * k) * time;
    height += wave.amplitude * Math.sin(phase);
  }
  return height * waterAmplitude(environment);
}

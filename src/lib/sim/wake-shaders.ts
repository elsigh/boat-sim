/** Metre-scale foam shared by the propeller boil and the wake left in the water. */
export const wakeNoiseShader = `
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
  }
  // Warped, nested eddies form islands and thin membranes of bubbles. All
  // overlapping deposits sample the same water coordinates, avoiding stamps.
  vec3 wakeFoam(vec2 p, float time) {
    vec2 drift = vec2(time * 0.045, -time * 0.035);
    vec2 warp = vec2(noise(p * 0.38 + drift), noise(p * 0.38 - drift + 17.3));
    vec2 q = p + (warp - 0.5) * 2.6;
    float islands = noise(q * 0.72);
    float cells = noise(q * 2.8 + warp * 2.0);
    float membranes = 1.0 - smoothstep(0.035, 0.17, abs(cells - 0.5));
    float detail = 1.0 - smoothstep(0.15, 0.65, length(fwidth(p)));
    float bubbles = mix(0.5, noise(q * 9.0 + vec2(time * 0.6, -time * 0.4)), detail);
    float clusters = smoothstep(0.23, 0.72, cells * 0.7 + bubbles * 0.3);
    return vec3(islands, clusters * 0.85 + membranes * 0.15, bubbles);
  }
`;

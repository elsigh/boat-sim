/** TCA 1&2: centre is neutral; the full lever travel controls engine demand. */
export function tcaThrottleCommand(rawAxis: number | undefined, axisIndex: number, buttons: readonly number[], deadzone = 0.08) {
  if (rawAxis === undefined || !Number.isFinite(rawAxis)) return 0;
  const position = Math.max(-1, Math.min(1, -rawAxis));
  const neutralButton = axisIndex === 0 ? 10 : 14;
  // The neutral contact tolerates the recorded centre-position sensor noise.
  if (Math.abs(position) <= deadzone || ((buttons[neutralButton] ?? 0) > 0.5 && Math.abs(position) < 0.15)) return 0;
  // Forward notch contacts do not pin RPM. Engine dynamics supplies the gentle
  // low-speed curve and spool-up, without compressing power into the last half.
  return Math.sign(position) * (Math.abs(position) - deadzone) / (1 - deadzone);
}

/** The neutral position opens the clutch immediately, even after full throttle. */
export function smoothThrottleCommand(previous: number, next: number, smoothing: number, centerSnapThreshold: number) {
  if (next === 0) return 0;
  const filtered = previous + (next - previous) * smoothing;
  if (Math.abs(filtered) <= centerSnapThreshold && Math.abs(next) <= centerSnapThreshold * 1.5) return 0;
  return Math.max(-1, Math.min(1, filtered));
}

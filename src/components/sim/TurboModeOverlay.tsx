import { TURBO_RPM } from "@/lib/sim/turbo-controls";
import styles from "./TurboModeOverlay.module.css";

export function TurboModeOverlay({ engines }: { engines: string }) {
  return (
    <div className={styles.overlay} role="status" aria-live="assertive">
      <div className={styles.speedLines} aria-hidden="true" />
      <p className={styles.title}>
        Turbo
        <span>{engines} · {TURBO_RPM.toLocaleString("en-US")} RPM</span>
      </p>
    </div>
  );
}

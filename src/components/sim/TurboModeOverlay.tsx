import styles from "./TurboModeOverlay.module.css";

export function TurboModeOverlay() {
  return (
    <div className={styles.overlay} role="status" aria-live="assertive">
      <div className={styles.speedLines} aria-hidden="true" />
      <p className={styles.title}>
        Turbo
        <span>Mode!</span>
      </p>
    </div>
  );
}

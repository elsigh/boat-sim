import styles from "./SimulatorLoading.module.css";

/** The same screen covers server rendering, hydration, and the first 3D frame. */
export function SimulatorLoading({ ready = false }: { ready?: boolean }) {
  return (
    <div
      className={styles.screen}
      data-ready={ready}
      role="status"
      aria-live="polite"
      aria-hidden={ready}
    >
      <div className={styles.label}>
        <svg width="48" height="20" viewBox="0 0 48 20" fill="none" aria-hidden="true">
          <path d="M2 7c5 0 5 6 11 6s6-6 11-6 6 6 11 6 6-6 11-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <p className={styles.brand}>boatsim</p>
        <p className={styles.caption}>Loading the harbor…</p>
      </div>
    </div>
  );
}

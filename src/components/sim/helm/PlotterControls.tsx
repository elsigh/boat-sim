import type { CSSProperties } from "react";

type PlotterIconName =
  | "sun"
  | "moon"
  | "north"
  | "heading"
  | "expand"
  | "collapse"
  | "locate"
  | "plus"
  | "minus";

function PlotterIcon({ name }: { name: PlotterIconName }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-[17px]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {name === "sun" ? (
        <>
          <circle cx="12" cy="12" r="3.5" />
          <path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" />
        </>
      ) : null}
      {name === "moon" ? <path d="M20.5 14.2A8.8 8.8 0 0 1 9.8 3.5a8.8 8.8 0 1 0 10.7 10.7Z" /> : null}
      {name === "north" ? <path d="M3 18V6l7 12V6m8 12V6m-3 3 3-3 3 3" /> : null}
      {name === "heading" ? <path d="m12 3 8 17-8-4-8 4Z" /> : null}
      {name === "expand" ? <path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5" /> : null}
      {name === "collapse" ? <path d="M3 8h5V3m8 0v5h5M8 21v-5H3m18 0h-5v5" /> : null}
      {name === "locate" ? (
        <>
          <circle cx="12" cy="12" r="6" />
          <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
          <path d="M12 2v4m0 12v4M2 12h4m12 0h4" />
        </>
      ) : null}
      {name === "plus" ? <path d="M5 12h14M12 5v14" /> : null}
      {name === "minus" ? <path d="M5 12h14" /> : null}
    </svg>
  );
}

/** Compact, uniform hit areas; no font-dependent symbols or delayed transitions. */
export function PlotterIconButton({
  icon,
  label,
  title = label,
  pressed,
  disabled,
  onClick,
  style,
}: {
  icon: PlotterIconName;
  label: string;
  title?: string;
  pressed?: boolean;
  disabled?: boolean;
  onClick: () => void;
  style?: CSSProperties;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      title={title}
      disabled={disabled}
      onClick={onClick}
      onPointerDown={(event) => event.stopPropagation()}
      className="grid size-7 shrink-0 cursor-pointer place-items-center rounded-md border border-transparent text-[color:var(--helm-text)] hover:border-current hover:bg-white/10 active:scale-95 aria-pressed:bg-[color:var(--helm-inset)] aria-pressed:text-[color:var(--helm-accent)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[color:var(--helm-accent)] disabled:cursor-default disabled:opacity-30"
      style={style}
    >
      <PlotterIcon name={icon} />
    </button>
  );
}

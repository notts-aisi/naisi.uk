/**
 * The four glyphs Home uses. Functional marks only, drawn at the size the
 * caller asks for with a 1.8 stroke, and hidden from a screen reader: the
 * words beside each one say what it is.
 */

type IconProps = { size?: number };

function frame(size: number) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    focusable: false,
  };
}

export function ArrowRight({ size = 16 }: IconProps) {
  return (
    <svg {...frame(size)}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

export function ChevronRight({ size = 16 }: IconProps) {
  return (
    <svg {...frame(size)}>
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

export function Check({ size = 16 }: IconProps) {
  return (
    <svg {...frame(size)}>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

export function External({ size = 14 }: IconProps) {
  return (
    <svg {...frame(size)}>
      <path d="M8 16L17 7M9 7h8v8" />
    </svg>
  );
}

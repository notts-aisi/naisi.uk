/**
 * The handful of line icons the form uses, for functional affordances only:
 * close, back, a tick, arrows, a grip. Drawn inline so they take the colour
 * of the text beside them, and always hidden from assistive technology: the
 * control each one sits in carries the words.
 */

type IconProps = { size?: number; strokeWidth?: number; className?: string };

function Line({
  size = 18,
  strokeWidth = 1.8,
  className,
  children,
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {children}
    </svg>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <Line {...props}>
      <path d="M6 6l12 12M18 6L6 18" />
    </Line>
  );
}

export function BackIcon(props: IconProps) {
  return (
    <Line {...props}>
      <path d="M15 6l-6 6 6 6" />
    </Line>
  );
}

export function TickIcon(props: IconProps) {
  return (
    <Line strokeWidth={2.6} size={16} {...props}>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </Line>
  );
}

export function ArrowRightIcon(props: IconProps) {
  return (
    <Line {...props}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </Line>
  );
}

export function ArrowUpIcon(props: IconProps) {
  return (
    <Line strokeWidth={1.9} {...props}>
      <path d="M12 19V5M6 11l6-6 6 6" />
    </Line>
  );
}

export function ArrowDownIcon(props: IconProps) {
  return (
    <Line strokeWidth={1.9} {...props}>
      <path d="M12 5v14M6 13l6 6 6-6" />
    </Line>
  );
}

export function SendIcon(props: IconProps) {
  return (
    <Line {...props}>
      <path d="M4 12l16-7-7 16-2-7z" />
    </Line>
  );
}

export function GripIcon(props: IconProps) {
  return (
    <Line size={20} {...props}>
      <circle cx="9" cy="7" r="1.1" />
      <circle cx="15" cy="7" r="1.1" />
      <circle cx="9" cy="12" r="1.1" />
      <circle cx="15" cy="12" r="1.1" />
      <circle cx="9" cy="17" r="1.1" />
      <circle cx="15" cy="17" r="1.1" />
    </Line>
  );
}

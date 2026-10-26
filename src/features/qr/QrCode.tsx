import { qrShape } from "@/lib/qr/shortLinkCode";

type Props = {
  /** What the code encodes: a short link's own address, from `shortLinkUrl`. */
  text: string;
  /** What a screen reader says the picture is. */
  label: string;
  className?: string;
};

/**
 * A QR code drawn on the server as inline SVG: black squares on white, which
 * prints sharp at any size and needs no script and no second request.
 */
export function QrCode({ text, label, className }: Props) {
  const { size, d } = qrShape(text);
  return (
    <svg
      className={className}
      viewBox={`0 0 ${size} ${size}`}
      shapeRendering="crispEdges"
      role="img"
      aria-label={label}
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width={size} height={size} fill="#fff" />
      <path fill="#000" d={d} />
    </svg>
  );
}

import styles from "./status.module.css";

/**
 * The picture across the top of an offer: a few points joined by fine lines,
 * with the programme's name set over its bottom corner by the caller.
 *
 * Decoration only. It is hidden from assistive technology and says nothing
 * the page does not also say in words.
 */

/** Each line as x1, y1, x2, y2 on a 520 by 116 field. */
const LINES: readonly (readonly [number, number, number, number])[] = [
  [463.3, 101.7, 485.2, 44.6],
  [463.3, 101.7, 395.4, 66.7],
  [447.7, 17.4, 485.2, 44.6],
  [447.7, 17.4, 384.3, 45.2],
  [304, 50.6, 303.3, 52.9],
  [304, 50.6, 294.5, 73.6],
  [274.4, 22, 303.3, 52.9],
  [112.7, 52.6, 106.2, 40.8],
  [112.7, 52.6, 126.5, 53.6],
  [126.5, 53.6, 106.2, 40.8],
  [32.6, 17.6, 106.2, 40.8],
  [360.5, 50.3, 384.3, 45.2],
  [360.5, 50.3, 335.5, 69.8],
  [266, 80.8, 247.6, 79.2],
  [266, 80.8, 294.5, 73.6],
  [192.5, 14.9, 171.2, 17.6],
  [395.4, 66.7, 384.3, 45.2],
  [335.5, 69.8, 303.3, 52.9],
  [294.5, 73.6, 303.3, 52.9],
];

/** Each point as x, y, and whether it is one of the three lit ones. */
const POINTS: readonly (readonly [number, number, boolean])[] = [
  [463.3, 101.7, true],
  [447.7, 17.4, false],
  [304, 50.6, false],
  [274.4, 22, false],
  [112.7, 52.6, false],
  [126.5, 53.6, false],
  [32.6, 17.6, false],
  [360.5, 50.3, true],
  [266, 80.8, false],
  [192.5, 14.9, false],
  [395.4, 66.7, false],
  [335.5, 69.8, false],
  [485.2, 44.6, false],
  [384.3, 45.2, false],
  [294.5, 73.6, true],
  [171.2, 17.6, false],
  [247.6, 79.2, false],
  [303.3, 52.9, false],
  [328.1, 27, false],
  [106.2, 40.8, false],
];

export default function OfferBanner() {
  return (
    <svg
      viewBox="0 0 520 116"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
      className={styles.bannerArt}
    >
      {LINES.map(([x1, y1, x2, y2]) => (
        <line
          key={`${x1}-${y1}-${x2}-${y2}`}
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke="var(--color-accent)"
          strokeOpacity={0.22}
          strokeWidth={1}
        />
      ))}
      {POINTS.map(([cx, cy, lit]) => (
        <circle
          key={`${cx}-${cy}`}
          cx={cx}
          cy={cy}
          r={lit ? 2.6 : 1.8}
          fill={lit ? "var(--color-live)" : "var(--color-accent)"}
          fillOpacity={lit ? 0.95 : 0.6}
        />
      ))}
    </svg>
  );
}

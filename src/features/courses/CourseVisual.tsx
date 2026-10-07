import type { CSSProperties } from "react";
import NetField from "@/components/ui/NetField";
import styles from "./CourseVisual.module.css";

/**
 * THE PICTURE ON A PROGRAMME'S CARD.
 *
 * Every course gets a picture without anybody having to make one: the
 * network motif on its navy ground, the same motif the page heroes use.
 * Which part of the net a card shows is a pure function of one stored value,
 * the page's `visualSeed`, so it is stable across renders, identical on the
 * server and in the browser, and an author can change it by typing a new
 * seed. Two courses with different seeds show different crops, so a row of
 * cards does not repeat itself.
 *
 * ## The cover override
 *
 * An author who HAS a picture wins: `coverImageUrl` replaces the motif,
 * rendered as a plain `<img>` (never `next/image`, see the repo note; the
 * default import resolves to an object under the Turbopack production
 * build). It requires `coverAlt`, which the write route enforces, because an
 * image with no alternative text is announced as nothing.
 *
 * The motif, by contrast, is DECORATIVE: the shared component hides it from
 * assistive technology, and it carries nothing the words beside it do not.
 */

type Props = {
  /**
   * `coursePages.visualSeed`. Callers pass the course id when the field is
   * empty, so a page nobody has authored still gets a crop of its own and
   * not the same one as every other unauthored course.
   */
  seed: string;
  /** Author's own artwork. Wins outright when present. */
  coverImageUrl?: string | null;
  /** Required alongside `coverImageUrl`; ignored without one. */
  coverAlt?: string;
  /** A line of metadata over the foot of the picture: "6 weeks · ~5 hrs a week". */
  label?: string;
  /** `card` sits at the top of a programme card, `wide` beside a paragraph. */
  size?: "card" | "wide";
  className?: string;
};

/**
 * FNV-1a over the seed. A hash and not a character sum, because two seeds
 * that differ by a letter must not produce two pictures that differ by a
 * pixel: "autumn-2026" and "autumn-2027" are exactly the pair an author will
 * try, and they have to look unrelated.
 */
function hashSeed(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32: small, fast, and identical on every runtime. */
function rng(state: number): () => number {
  let a = state || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Which part of the net this seed shows: how far in, which way round, and
 * where. The shift never exceeds what the zoom leaves spare on each side, so
 * the motif always covers the whole picture.
 */
function cropFor(seed: string): CSSProperties {
  const next = rng(hashSeed(seed || "naisi"));
  const zoom = 1.05 + Math.floor(next() * 4) * 0.08;
  const spare = ((zoom - 1) / 2) * 100 * 0.9;
  const shift = () => `${((next() * 2 - 1) * spare).toFixed(2)}%`;
  return {
    "--net-zoom": zoom.toFixed(2),
    "--net-x": shift(),
    "--net-y": shift(),
    "--net-flip-x": next() < 0.5 ? "-1" : "1",
    "--net-flip-y": next() < 0.5 ? "-1" : "1",
  } as CSSProperties;
}

export default function CourseVisual({
  seed,
  coverImageUrl,
  coverAlt,
  label,
  size = "card",
  className,
}: Props) {
  const wrap = [
    styles.visual,
    size === "wide" ? styles.wide : styles.card,
    coverImageUrl ? styles.hasCover : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={wrap}>
      {coverImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={coverImageUrl} alt={coverAlt ?? ""} className={styles.cover} />
      ) : (
        <div className={styles.net} style={cropFor(seed)}>
          <NetField net="card" strength="strong" className={styles.fill} />
        </div>
      )}
      {label ? <span className={`meta ${styles.label}`}>{label}</span> : null}
    </div>
  );
}

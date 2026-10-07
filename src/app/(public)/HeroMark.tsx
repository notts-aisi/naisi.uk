import {
  HERO_MARK_SHIELD,
  HERO_MARK_TOWER,
  HERO_MARK_VIEW_BOX,
  HERO_MARK_WAVE,
} from "./heroMarkPaths";
import styles from "./HomeHero.module.css";

/** The emblem's three shapes, once. The mark below draws them three times. */
function Emblem() {
  return (
    <>
      <path d={HERO_MARK_TOWER} fillRule="evenodd" />
      <path d={HERO_MARK_SHIELD} />
      <path d={HERO_MARK_WAVE} />
    </>
  );
}

/**
 * The hero's mark: the white emblem with a cyan copy set just behind it.
 *
 * Rules a maintainer has to keep:
 *
 *  - The wrapper carries `data-mark` and is exactly as large as the drawing.
 *    The hero's scene measures that box and draws in the mark's own units, so
 *    nothing but the drawing goes inside it and it takes no padding.
 *  - `--nh-kick` and `--nh-flash` are set on the hero's root by the scene.
 *    With no scene they are unset: the copy rests where the stylesheet puts it
 *    and the flash stays dark.
 *  - The colours are the emblem's own and are never changed.
 */
export default function HeroMark() {
  return (
    <div
      data-mark=""
      data-keepout="mark"
      data-pad="14"
      data-feather="56"
      data-strength="0.6"
      className={styles.mark}
    >
      <svg viewBox={HERO_MARK_VIEW_BOX} role="img" aria-label="Nottingham AI Safety Initiative">
        <g className={styles.markOffset}>
          <g style={{ transform: "translate(calc(var(--nh-kick, 0) * -5px), calc(var(--nh-kick, 0) * 5px))" }}>
            <g fill="#00d4ff">
              <Emblem />
            </g>
            <g fill="#c9fbff" style={{ opacity: "var(--nh-flash, 0)" }}>
              <Emblem />
            </g>
          </g>
        </g>
        <g fill="#ffffff">
          <Emblem />
        </g>
      </svg>
    </div>
  );
}

/**
 * The pieces a page puts inside `<HeroScene>`.
 *
 * These are ordinary components with no script of their own: a Server
 * Component renders them and they arrive as finished markup. Each one carries
 * the attributes the scene looks for, with the boards' numbers, so a page
 * that uses them cannot get the contract wrong. README.md has a complete
 * example and says what each attribute means.
 *
 * One set of pieces serves all three forms. The stylesheet moves and resizes
 * them by the width and shape of the screen, and sets aside the ones a form
 * does not show.
 */
import { Fragment, type ReactNode } from "react";
import { keepOut } from "./keepOut";
import { MARK_INK, MARK_SHAPES, MARK_VIEW_BOX } from "./markArt";
import styles from "./HeroScene.module.css";

/** The column the words sit in. Everything else here goes inside it. */
export function HeroColumn({ children }: { children: ReactNode }) {
  return (
    <div className={styles.column}>
      <div className={styles.stack}>{children}</div>
    </div>
  );
}

function MarkShapes() {
  return (
    <>
      {MARK_SHAPES.map((shape) => (
        <path key={shape.d} d={shape.d} fillRule={shape.evenOdd ? "evenodd" : undefined} />
      ))}
    </>
  );
}

/**
 * The emblem. The scene finds it by `data-mark`, reads its box, and lights
 * the head cut out of its shield from behind.
 */
export function HeroMark() {
  return (
    <div className={styles.mark} data-mark="" {...keepOut("mark")}>
      <svg
        className={styles.markArt}
        viewBox={MARK_VIEW_BOX}
        role="img"
        aria-label="Nottingham AI Safety Initiative"
      >
        <g className={styles.markOffset}>
          <g className={styles.markKick}>
            <g fill={MARK_INK.offset}>
              <MarkShapes />
            </g>
            <g className={styles.markFlash} fill={MARK_INK.flash}>
              <MarkShapes />
            </g>
          </g>
        </g>
        <g fill={MARK_INK.body}>
          <MarkShapes />
        </g>
      </svg>
    </div>
  );
}

/**
 * The society's name under the emblem, on the phone and tablet forms. The
 * scene stops its network a little above this line, so those two forms need
 * it.
 */
export function HeroTagline({ children }: { children: ReactNode }) {
  return (
    <p className={styles.tagline} {...keepOut("tagline")}>
      {children}
    </p>
  );
}

type HeroHeadlineProps = {
  /** The part that rises in a word at a time: "Make AI go well." */
  lead: string;
  /** The part the scene types, underlines, deletes and types again: "From Nottingham." */
  accent: string;
};

/**
 * The page's `h1`. Both parts are in the markup in full, and a screen reader
 * is given them as one sentence that never changes while the scene types.
 */
export function HeroHeadline({ lead, accent }: HeroHeadlineProps) {
  const words = lead.split(/\s+/).filter(Boolean);
  return (
    <h1 className={styles.headline} {...keepOut("headline")}>
      <span className="visually-hidden">
        {lead} {accent}
      </span>
      <span aria-hidden="true">
        {words.map((word, index) => (
          <Fragment key={index}>
            {index > 0 ? " " : null}
            <span
              className={styles.word}
              data-word=""
              style={{ animationDelay: `${500 + index * 120}ms` }}
            >
              {word}
            </span>
          </Fragment>
        ))}
      </span>{" "}
      <span className={styles.accentWrap} aria-hidden="true">
        <span className={styles.accent} data-accent-text="">
          {accent}
        </span>
        <span className={styles.caret}>|</span>
      </span>
    </h1>
  );
}

/** The paragraph under the headline. */
export function HeroLede({ children }: { children: ReactNode }) {
  return (
    <p className={styles.lede} {...keepOut("lede")}>
      {children}
    </p>
  );
}

type HeroActionsProps = {
  /** The hero's links, as the page styles them. A row, or a column on a phone. */
  children: ReactNode;
  /**
   * The line under the buttons, as its parts: `["Applications open now",
   * "close Sun 18 Oct, 23:59"]`. A middle dot is set between them, and each
   * part stays on one line, so a narrow screen breaks at the dot as the
   * boards do. Write sentence case: the stylesheet sets the mono face and the
   * capitals. Leave it out, or pass none, for no line.
   */
  status?: readonly ReactNode[];
};

/** The buttons and the line under them, as one zone. */
export function HeroActions({ children, status }: HeroActionsProps) {
  const parts = status ?? [];
  return (
    <div className={styles.actions} {...keepOut("cta")}>
      <div className={styles.buttons}>{children}</div>
      {parts.length > 0 ? (
        <p className={`meta ${styles.status}`}>
          {parts.map((part, index) => (
            <Fragment key={index}>
              {index > 0 ? " \u00b7 " : null}
              <span className={styles.statusPart}>{part}</span>
            </Fragment>
          ))}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The room for the award under the buttons, on the desktop and tablet forms.
 * The phone form does not show it.
 */
export function HeroAward({ children }: { children: ReactNode }) {
  return (
    <div className={styles.award} {...keepOut("award")}>
      {children}
    </div>
  );
}

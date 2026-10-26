import BrandMark from "./BrandMark";
import { ProgrammeCrest } from "./ProgrammeCrest";
import type { ShownCrest } from "@/lib/crests/resolve";
import styles from "./ProgrammeMark.module.css";

/*
  THE MARK BESIDE A PROGRAMME'S NAME: its crest, or the NAISI emblem in a
  crest's place.

  Every page that shows a programme crest draws it here, and only here, so
  the rule for a programme without one is the same everywhere: the emblem,
  drawn by BrandMark at the same height (its header cut at 64px and under,
  as the brand's masters give it). Which of the two is drawn is not decided
  here: `shown` is what src/lib/crests/resolve.ts answered for the page.

  Night theme throughout: every surface of the site sits on the dark ground.
  Decorative by default, because the programme's name is printed beside the
  mark wherever it is drawn. Give `title` only where the mark stands alone.
  It is never a button and never a link of its own.

  Server-safe: no state and no effects, so a public page renders it on the
  server and nothing about it is sent to the browser but the drawing.
*/

type Props = {
  /** The resolver's answer: a crest, or null for the NAISI emblem. */
  shown: ShownCrest;
  /** Height in pixels. The crest's small cut is drawn under 72. */
  size: number;
  /** An accessible name, only where no name is printed beside the mark. */
  title?: string;
  className?: string;
};

export default function ProgrammeMark({ shown, size, title, className }: Props) {
  if (shown) {
    return (
      <ProgrammeCrest
        crest={shown}
        size={size}
        title={title}
        className={[styles.drawn, className ?? ""].filter(Boolean).join(" ")}
      />
    );
  }
  const named = title ? ({ role: "img", "aria-label": title } as const) : ({ "aria-hidden": true } as const);
  return (
    <span className={[styles.emblem, className ?? ""].filter(Boolean).join(" ")} {...named}>
      <BrandMark size={size} showWordmark={false} />
    </span>
  );
}

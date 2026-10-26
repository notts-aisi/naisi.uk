import type { ReactNode } from "react";
import Prose, { Runs } from "@/features/courses/weekBlocks/Prose";
import type { GuideBlock, GuideDocument } from "@/lib/courses/facilitatorGuide/model";
import type { ProseParagraph } from "@/lib/courses/weekBlocks/prose";
import styles from "./guide.module.css";

/**
 * ONE DOCUMENT OF A COURSE'S FACILITATOR GUIDE, DRAWN: its headings, its
 * text, tables and quotes, the lists of things to tick on paper, and its
 * printable templates exactly as written. The text is the week blocks' own
 * renderer (`Prose`), so nothing a document holds is ever handed to the page
 * as HTML: every run is a text node, and a link is drawn only when its
 * address is https or mailto.
 *
 * `level` is the heading level of the document's "##" sections on the page
 * that draws it: 2 where the document is the page, 3 where the page heads
 * it with its own title. Deeper headings follow, to h6.
 *
 * No hooks and no browser API: drawn on the server. Only pages behind the
 * guide's gate draw it.
 */

type Props = { doc: GuideDocument; level: 2 | 3 };

function Heading({ level, children }: { level: number; children: ReactNode }) {
  switch (Math.min(6, level)) {
    case 2:
      return <h2 className={styles.h2}>{children}</h2>;
    case 3:
      return <h3 className={styles.h3}>{children}</h3>;
    case 4:
      return <h4 className={styles.h4}>{children}</h4>;
    case 5:
      return <h5 className={styles.h5}>{children}</h5>;
    default:
      return <h6 className={styles.h5}>{children}</h6>;
  }
}

function ProseRun({ prose }: { prose: ProseParagraph[] }) {
  return (
    <Prose
      prose={prose}
      className={styles.prose}
      paragraphClassName={styles.paragraph}
      listClassName={styles.list}
      tableClassName={styles.table}
      codeClassName={styles.code}
      linkClassName={styles.link}
    />
  );
}

/** The blocks in order, each run of plain text, lists, tables and code drawn together. */
export default function GuideDocumentView({ doc, level }: Props) {
  const out: ReactNode[] = [];
  let run: ProseParagraph[] = [];
  const flush = () => {
    if (run.length > 0) out.push(<ProseRun key={`p${out.length}`} prose={run} />);
    run = [];
  };
  doc.blocks.forEach((block: GuideBlock, index) => {
    switch (block.type) {
      case "heading":
        flush();
        out.push(
          <Heading key={index} level={block.level - 2 + level}>
            <Runs runs={block.runs} linkClassName={styles.link} />
          </Heading>,
        );
        break;
      case "quote":
        flush();
        out.push(
          <blockquote key={index} className={styles.quote}>
            <ProseRun prose={block.body} />
          </blockquote>,
        );
        break;
      case "checklist":
        flush();
        out.push(
          <ul key={index} className={styles.checklist}>
            {block.items.map((item, itemIndex) => (
              <li key={itemIndex} className={styles.checkItem}>
                <span className={item.checked ? `${styles.box} ${styles.boxTicked}` : styles.box} aria-hidden="true" />
                <span className={styles.checkText}>
                  <Runs runs={item.runs} linkClassName={styles.link} />
                </span>
              </li>
            ))}
          </ul>,
        );
        break;
      default:
        run.push(block);
    }
  });
  flush();
  return <div className={styles.document}>{out}</div>;
}

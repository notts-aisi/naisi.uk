import type { ReactNode } from "react";
import Link from "next/link";
import Prose, { Runs } from "@/features/courses/weekBlocks/Prose";
import {
  isSupportHeading,
  reflectionsLineAt,
  sectionAnchors,
  type StartHereDoc,
} from "@/lib/courses/guide/model";
import { GLOSSARY, ON_THIS_SITE, START_HERE, START_HERE_EMPTY, backToWords } from "@/lib/courses/guide/words";
import { ON_THIS_PAGE } from "@/lib/courses/memberPageWords";
import { runsText, type Prose as ProseData, type ProseParagraph } from "@/lib/courses/weekBlocks/prose";
import GuideHead, { GuidePhoneBar } from "./GuideHead";
import styles from "./guide.module.css";

/**
 * A PROGRAMME'S START HERE, AS SOMEBODY ON IT READS IT (boards wk-start at
 * 1440 with "On this page", and wk-start-phone): the programme's label and
 * "Start here", the guide's opening, then each section as the guide wrote
 * it (lists, numbered lists and tables, a table's rows stacked on a phone),
 * Support in a box of its own, and the credit line at the foot.
 *
 * Under the guide's "Reflections." paragraph, the site's own box: where
 * reflections are written and who reads them, named from records by the
 * page that draws this (`onThisSite`). Nothing about a person is in the
 * document.
 *
 * A run with no Start here yet draws a calm line and the way back.
 *
 * No hooks and no browser API: drawn on the server, every run of text a text
 * node through the one renderer (`Prose`, `Runs`).
 */

type Props = {
  backHref: string;
  programmeName: string;
  eyebrow: string;
  doc: StartHereDoc | null;
  /** The box's words after "On this site:", for this reader. */
  onThisSite: string;
  /** The Glossary, when the run has one. */
  glossaryHref: string | null;
};

export default function StartHere({ backHref, programmeName, eyebrow, doc, onThisSite, glossaryHref }: Props) {
  const anchors = doc ? sectionAnchors(doc.sections) : [];
  return (
    <div className={styles.page}>
      <GuidePhoneBar backHref={backHref} programmeName={programmeName} title={START_HERE} />
      <div className={styles.layout}>
        <article className={styles.article}>
          <GuideHead backHref={backHref} programmeName={programmeName} eyebrow={eyebrow} title={START_HERE} />
          {doc ? (
            <StartHereBody doc={doc} anchors={anchors} onThisSite={onThisSite} />
          ) : (
            <div className={styles.empty}>
              <p>{START_HERE_EMPTY}</p>
              <Link className={styles.emptyLink} href={backHref}>
                {backToWords(programmeName)}
              </Link>
            </div>
          )}
        </article>
        {doc && (doc.sections.length > 0 || glossaryHref) && (
          <nav className={styles.rail} aria-label={ON_THIS_PAGE}>
            <p className={styles.railTitle}>{ON_THIS_PAGE}</p>
            <ul className={styles.railList} role="list">
              {doc.sections.map((section, i) => (
                <li key={anchors[i]}>
                  <a className={styles.railLink} href={`#${anchors[i]}`}>
                    {section.heading}
                  </a>
                </li>
              ))}
            </ul>
            {glossaryHref && (
              <div className={styles.railGlossary}>
                <Link className={styles.railLink} href={glossaryHref}>
                  {GLOSSARY}
                  <span aria-hidden="true">→</span>
                </Link>
              </div>
            )}
          </nav>
        )}
      </div>
    </div>
  );
}

function StartHereBody({ doc, anchors, onThisSite }: { doc: StartHereDoc; anchors: string[]; onThisSite: string }) {
  const at = reflectionsLineAt(doc);
  return (
    <>
      <Prose prose={doc.lead} className={styles.lede} listClassName={styles.list} linkClassName={styles.inlineLink} codeClassName={styles.code} />
      {doc.sections.map((section, i) => {
        const support = isSupportHeading(section.heading);
        const id = anchors[i];
        const Heading = section.level === 3 && !support ? "h3" : "h2";
        const body = (
          <SectionBody
            prose={section.body}
            after={
              at && at.section === i
                ? {
                    paragraph: at.paragraph,
                    node: (
                      <div className={styles.onThisSite}>
                        <strong>{ON_THIS_SITE}</strong> {onThisSite}
                      </div>
                    ),
                  }
                : null
            }
          />
        );
        return (
          <section key={id} className={support ? styles.support : styles.section} aria-labelledby={id}>
            <Heading id={id} className={Heading === "h3" ? styles.h3 : styles.h2}>
              {section.heading}
            </Heading>
            {body}
          </section>
        );
      })}
      {doc.credit.length > 0 && (
        <div className={styles.foot}>
          <p>
            <Runs runs={doc.credit} linkClassName={styles.inlineLink} />
          </p>
        </div>
      )}
    </>
  );
}

/**
 * A section's text in order: runs of paragraphs and lists through the one
 * renderer, each table as a card whose rows stack on a phone, and the box
 * about reflections straight after the paragraph it belongs under.
 */
function SectionBody({ prose, after }: { prose: ProseData; after: { paragraph: number; node: ReactNode } | null }) {
  const out: ReactNode[] = [];
  let chunk: ProseData = [];
  const flush = () => {
    if (chunk.length === 0) return;
    out.push(
      <Prose
        key={`p${out.length}`}
        prose={chunk}
        className={styles.flow}
        listClassName={styles.list}
        linkClassName={styles.inlineLink}
        codeClassName={styles.code}
      />,
    );
    chunk = [];
  };
  prose.forEach((paragraph, index) => {
    if (paragraph.type === "table") {
      flush();
      out.push(<GuideTable key={`t${index}`} table={paragraph} />);
    } else {
      chunk.push(paragraph);
    }
    if (after && after.paragraph === index) {
      flush();
      out.push(<div key={`a${index}`}>{after.node}</div>);
    }
  });
  flush();
  return <div className={styles.body}>{out}</div>;
}

/**
 * A table of the guide's: its first column is each row's own heading. On a
 * phone the rows stack, and a value carries its column's heading beside it:
 * from the third column on, and from the second too when the first heading
 * is empty (a rubric), whose rows each become a card of their own.
 */
function GuideTable({ table }: { table: Extract<ProseParagraph, { type: "table" }> }) {
  const corner = runsText(table.header[0]?.runs ?? []) === "";
  return (
    <div className={`${styles.tableBox} ${corner ? styles.cards : ""}`}>
      <table className={styles.table}>
        <thead>
          <tr>
            {table.header.map((cell, index) => (
              <th key={index} scope="col">
                <Runs runs={cell.runs} linkClassName={styles.inlineLink} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.cells.map((cell, index) => {
                if (index === 0) {
                  return (
                    <th key={index} scope="row">
                      <Runs runs={cell.runs} linkClassName={styles.inlineLink} />
                    </th>
                  );
                }
                const label = index >= 2 || corner ? table.header[index]?.runs ?? [] : [];
                const labelled = runsText(label) !== "";
                return (
                  <td key={index} className={labelled ? styles.labelled : undefined}>
                    <span className={styles.cell}>
                      {labelled && (
                        <span className={styles.cellLabel}>
                          <Runs runs={label} />
                        </span>
                      )}
                      <span>
                        <Runs runs={cell.runs} linkClassName={styles.inlineLink} />
                      </span>
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

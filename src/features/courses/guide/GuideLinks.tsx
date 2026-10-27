import { Fragment } from "react";
import Link from "next/link";
import type { GuideLinks } from "@/lib/courses/guide/model";
import { GLOSSARY, START_HERE } from "@/lib/courses/guide/words";
import styles from "./guide.module.css";

/**
 * The way to a programme's Start here and Glossary under a week's title
 * (st-week1-phone, wk-week: "Start here · Glossary"). Each page is linked
 * only when the run has its document; with neither, nothing is drawn. The
 * programme page's card is `../AboutThisCourse.tsx`.
 */

function hrefs(runId: string) {
  const base = `/learn/${encodeURIComponent(runId)}`;
  return { startHere: `${base}/start-here`, glossary: `${base}/glossary` };
}

/** "Start here · Glossary" under a week's title. */
export function WeekGuideLinks({ runId, links }: { runId: string; links: GuideLinks | null }) {
  if (!links) return null;
  const href = hrefs(runId);
  const items = [
    ...(links.startHere ? [{ key: "start-here", href: href.startHere, label: START_HERE }] : []),
    ...(links.glossaryTerms !== null ? [{ key: "glossary", href: href.glossary, label: GLOSSARY }] : []),
  ];
  if (items.length === 0) return null;
  return (
    <p className={styles.weekLinks}>
      {items.map((item, index) => (
        <Fragment key={item.key}>
          {index > 0 && <span aria-hidden="true">·</span>}
          <Link className={styles.weekLink} href={item.href}>
            {item.label}
          </Link>
        </Fragment>
      ))}
    </p>
  );
}

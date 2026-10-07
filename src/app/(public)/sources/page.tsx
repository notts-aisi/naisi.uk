import type { Metadata } from "next";
import Link from "next/link";
import Notice from "@/components/ui/Notice";
import { listPublishedSourceSheets } from "@/features/sources/fetchSourceSheets";
import { formatSiteDate } from "@/lib/datetime/siteTime";
import styles from "./sources.module.css";

export const metadata: Metadata = {
  title: "Sources",
  description:
    "Where the claims on our posters, flyers and posts come from. Each piece of material has its own numbered list of sources, with links.",
};

export const dynamic = "force-dynamic";

/**
 * "21 Sep 2026", in the site's time zone. Put together from its parts so the
 * month is always three letters, as every date set in the metadata face is.
 */
function formatSheetDate(date: Date): string {
  const day = formatSiteDate(date, { day: "numeric" });
  const month = formatSiteDate(date, { month: "short" }).slice(0, 3);
  const year = formatSiteDate(date, { year: "numeric" });
  return `${day} ${month} ${year}`;
}

/**
 * The index of published material.
 *
 * A Server Component with no client component under it, so nothing about a
 * sheet is serialised into the page beyond what is drawn. The projection in
 * `fetchSourceSheets.ts` already drops everything else, and
 * `tests/public-client-props.test.mjs` keeps this page from growing a client
 * child that takes a whole document.
 */
export default async function SourcesIndex() {
  const sheets = await listPublishedSourceSheets();

  return (
    <section className={styles.section}>
      <div className="container">
        <div className={styles.intro}>
          <p className={`meta ${styles.eyebrow}`}>Where our claims come from</p>
          <h1 className={styles.title}>Sources</h1>
          <p className={styles.lede}>
            Our posters, flyers and posts carry small numbers next to the things
            they claim. Each piece of material has a page here listing what
            those numbers refer to, with a link to every source.
          </p>
        </div>

        {sheets.length === 0 ? (
          <Notice tone="neutral" role="note" className={styles.empty}>
            Nothing is listed here yet. If you have scanned a code on one of
            our posters and landed on this page, the sources for it are on
            their way. The address printed under the code will keep working.
          </Notice>
        ) : (
          <ul className={styles.list}>
            {sheets.map((sheet) => (
              <li key={sheet.slug} className={styles.item}>
                <Link href={`/sources/${sheet.slug}`} className={styles.row}>
                  <div className={styles.body}>
                    <h2 className={styles.rowTitle}>{sheet.title}</h2>
                    <div className={styles.facts}>
                      {sheet.publishedAt && (
                        <time className={styles.date} dateTime={sheet.publishedAt}>
                          {formatSheetDate(new Date(sheet.publishedAt))}
                        </time>
                      )}
                      <span>
                        {sheet.sourceCount}{" "}
                        {sheet.sourceCount === 1 ? "source" : "sources"}
                      </span>
                      {sheet.hasFile && <span>PDF available</span>}
                    </div>
                    {sheet.context && <p className={styles.note}>{sheet.context}</p>}
                    {sheet.summary && <p className={styles.note}>{sheet.summary}</p>}
                  </div>
                  {sheet.image && (
                    /* Firebase Storage image on a public page. next/image
                       breaks the Turbopack production build in this repo
                       (the default import resolves to an object), so every
                       image on the site is a plain tag. */
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={sheet.image.url}
                      alt={sheet.image.alt}
                      className={styles.thumb}
                    />
                  )}
                  <span className={styles.arrow}>
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                      focusable="false"
                    >
                      <path d="M5 12h14M13 6l6 6-6 6" />
                    </svg>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

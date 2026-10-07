import type { Metadata } from "next";
import Link from "next/link";
import { cache } from "react";
import { getPublishedSourceSheet } from "@/features/sources/fetchSourceSheets";
import { formatSiteDate } from "@/lib/datetime/siteTime";
import styles from "./sourceSheet.module.css";

type Props = { params: Promise<{ slug: string }> };

/**
 * One read shared by `generateMetadata` and the render, the way the news
 * article page does it. `params` is a Promise in this version of Next and has
 * to be awaited in both.
 */
const loadSheet = cache(async (slug: string) => getPublishedSourceSheet(slug));

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const sheet = await loadSheet(slug);
  if (!sheet) {
    // The same answer an unknown slug gets. `noindex` because the page says
    // nothing worth indexing and the address may be republished later with
    // real content behind it.
    return { title: "Sources", robots: { index: false, follow: true } };
  }

  const description =
    sheet.summary ||
    `The sources behind ${sheet.title}, with a link to each one.`;

  return {
    title: `Sources: ${sheet.title}`,
    description,
    openGraph: {
      title: `Sources: ${sheet.title}`,
      description,
      type: "article",
      publishedTime: sheet.publishedAt || undefined,
      images: sheet.image ? [{ url: sheet.image.url }] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: `Sources: ${sheet.title}`,
      description,
    },
  };
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

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

function Icon({ path, size = 18 }: { path: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={path} />
    </svg>
  );
}

const CHEVRON_LEFT = "M15 6l-6 6 6 6";
const EXTERNAL = "M7 17L17 7M9 7h8v8";
const DOWNLOAD = "M12 4v12M6 11l6 6 6-6M5 20h14";

/**
 * The page a scanned QR code opens.
 *
 * NEVER `notFound()`. An unpublished entry and a slug that names nothing get
 * the same calm page, because the reader is standing in front of the poster
 * that sent them here and a 404 tells them the society printed a broken
 * address. The fetcher makes the two cases indistinguishable so the page
 * cannot accidentally become an existence oracle for drafts.
 *
 * A Server Component with no client child: every prop handed to a client
 * component on a public page ends up in the HTML, and the projection above is
 * what keeps that from mattering here. It also means the whole page is in
 * the first HTML: nothing here waits for a script, and nothing is animated in.
 */
export default async function SourceSheetPage({ params }: Props) {
  const { slug } = await params;
  const sheet = await loadSheet(slug);

  if (!sheet) {
    return (
      <article className={styles.article}>
        <div className={`container ${styles.missing}`}>
          <p className={`meta ${styles.eyebrow}`}>Sources</p>
          <h1 className={styles.title}>Sources for this aren&apos;t published yet</h1>
          <p className={styles.summary}>
            The address you scanned is right, and it will keep working. The
            numbered list of sources for this piece has not gone up yet, so
            there is nothing to read here for the moment. It is worth trying
            again in a day or two.
          </p>
          <div className={styles.placeholderLinks}>
            <Link href="/sources" className={styles.placeholderLink}>
              All published sources
            </Link>
            <Link href="/" className={styles.placeholderLink}>
              NAISI home
            </Link>
          </div>
        </div>
      </article>
    );
  }

  const fileSize = sheet.file ? formatBytes(sheet.file.sizeBytes) : "";
  const hasMaterial = sheet.image !== null || sheet.file !== null;

  return (
    <article className={styles.article}>
      <div className={`container ${styles.columns}`}>
        <div className={styles.main}>
          <Link href="/sources" className={styles.back}>
            <Icon path={CHEVRON_LEFT} />
            <span>All sources</span>
          </Link>
          <p className={`meta ${styles.eyebrow}`}>Sources</p>
          <h1 className={styles.title}>{sheet.title}</h1>

          {(sheet.publishedAt || sheet.context) && (
            <div className={styles.facts}>
              {sheet.publishedAt && (
                <time className={styles.date} dateTime={sheet.publishedAt}>
                  {formatSheetDate(new Date(sheet.publishedAt))}
                </time>
              )}
              {sheet.context && <span>{sheet.context}</span>}
            </div>
          )}

          {sheet.summary && <p className={styles.summary}>{sheet.summary}</p>}

          <section className={styles.listSection} aria-labelledby="sources-list">
            <h2 id="sources-list" className={styles.listHeading}>
              The list
            </h2>

            {sheet.items.length === 0 ? (
              <p className={styles.noSources}>
                No sources have been listed for this one yet.
              </p>
            ) : (
              /* The list's own markers are off, so `role` keeps it a list
                 for a screen reader that would otherwise drop it. */
              <ol className={styles.list} role="list">
                {sheet.items.map((item) => (
                  /* The number is the one PRINTED on the material: the stored
                     value, written out, never a position in this list. A
                     deleted row leaves a gap and every later citation still
                     sits beside its own number. `value` says the same to
                     anything that reads the list's numbering. */
                  <li key={`${item.n}-${item.name}`} value={item.n} className={styles.item}>
                    <span className={styles.itemNumber}>{item.n}</span>
                    <div className={styles.itemBody}>
                      {item.href ? (
                        <a
                          className={`${styles.itemName} ${styles.itemLink}`}
                          href={item.href}
                          target="_blank"
                          rel="noreferrer noopener"
                        >
                          {item.name}
                        </a>
                      ) : (
                        <span className={styles.itemName}>{item.name}</span>
                      )}
                      {item.host && (
                        <span className={styles.itemHost}>
                          <span className={styles.itemHostName}>{item.host}</span>
                          <Icon path={EXTERNAL} size={14} />
                        </span>
                      )}
                      {item.comment && <p className={styles.itemComment}>{item.comment}</p>}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        {hasMaterial && (
          <aside className={styles.material} aria-label="The material">
            {sheet.image && (
              <figure className={styles.figure}>
                {/* Plain tag rather than next/image: the optimiser's default import
                    resolves to an object under this repo's Turbopack build. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={sheet.image.url}
                  alt={sheet.image.alt}
                  className={styles.image}
                />
              </figure>
            )}

            {sheet.file && (
              <>
                {/* `download` is inert here: Firebase Storage serves the file from
                    another origin and a cross-origin anchor ignores the attribute.
                    What actually makes this download rather than open in a tab is the
                    `contentDisposition: attachment` the uploader writes into the
                    object's own metadata. The attribute is kept because it costs
                    nothing and states the intent. */}
                <a
                  className={styles.download}
                  href={sheet.file.url}
                  download={sheet.file.filename}
                  rel="noreferrer noopener"
                >
                  <Icon path={DOWNLOAD} />
                  <span>Download the PDF</span>
                </a>
                {fileSize && <p className={styles.downloadMeta}>{fileSize}</p>}
              </>
            )}
          </aside>
        )}
      </div>
    </article>
  );
}

import Link from "next/link";
import { PROGRAMMES_PATH } from "@/lib/applications/programmes/path";
import type { HomeProgrammes } from "@/lib/applications/programmes/home";
import own from "./ProgrammesHome.module.css";
import styles from "./home.module.css";

/**
 * THE PROGRAMMES CARD, first on an admin's Home ("Programmes") and a lead's
 * ("Your programmes"): a row for each programme of a term that is not over
 * whose groups the reader opens, grouped by term, each with where it is, the
 * first thing that needs the reader where there is one, and Open, to its
 * Overview; and All programmes, to the Programmes page.
 *
 * Made on the server from the Programmes list (`homeProgrammesOf`), which
 * the page asks for only for an admin or somebody named on a form, never in
 * a view-as session. The page puts this inside its own Suspense boundary, so
 * Home never waits on it; the answer is null when the list could not be
 * read, and then, as with no row at all, this draws nothing.
 */
export default async function ProgrammesHome({
  programmes,
  title,
}: {
  programmes: Promise<HomeProgrammes | null>;
  /** "Programmes" for an admin, "Your programmes" for a lead. */
  title: string;
}) {
  const answer = await programmes;
  if (!answer || answer.terms.length === 0) return null;
  return (
    <section className={styles.card} aria-labelledby="home-programmes" data-testid="home-programmes">
      <div className={styles.cardHead}>
        <h2 id="home-programmes" className={styles.cardTitle}>
          {title}
        </h2>
        <Link href={PROGRAMMES_PATH} className={styles.headLink}>
          <span className={own.wide}>All programmes</span>
          <span className={own.narrow}>All</span>
        </Link>
      </div>
      {answer.terms.map((term) => (
        <div key={term.id} className={own.term}>
          <h3 className={`meta ${own.heading}`}>{term.heading}</h3>
          <ul className={own.rows} role="list">
            {term.rows.map((row) => (
              <li key={row.id} className={own.row}>
                <div className={own.body}>
                  <p className={own.name}>{row.name}</p>
                  {(row.detail || row.kind) && (
                    <p className={styles.small}>
                      <span className={own.wide}>
                        {row.detail ? `${row.kind} · ${row.detail}` : row.kind}
                      </span>
                      {row.detail && <span className={own.narrow}>{row.detail}</span>}
                    </p>
                  )}
                  {row.needsYou && <p className={own.needsYou}>{row.needsYou}</p>}
                </div>
                <Link href={row.href} className={styles.secondary}>
                  Open<span className={styles.srOnly}> {row.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

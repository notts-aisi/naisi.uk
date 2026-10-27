import type { Metadata } from "next";
import Link from "next/link";
import BrandMark from "@/components/BrandMark";
import AnonymousFormScreen from "@/features/anonymousFeedback/AnonymousFormScreen";
import { getAdminDb } from "@/lib/firebase/admin";
import { NO_FORM_SCREEN, formScreenFor, type FormScreen } from "@/lib/anonymousFeedback/view";
import { FORM_WORDS } from "@/lib/anonymousFeedback/words";
import styles from "./feedback.module.css";

/**
 * A PROGRAMME'S ANONYMOUS KEEP, CHANGE AND DROP FORM, by its one link, which
 * is the same for everybody on the programme (docs/surveys.md, "The anonymous
 * form at a programme's end").
 *
 * THE PAGE NEVER ASKS WHO IS LOOKING. It is drawn from the link alone: no
 * session, no cookie, no header, no address is read, signed in or not, and
 * opening it writes nothing. It says before the questions that it is
 * anonymous and how.
 *
 * WHY IT IS OUTSIDE THE ROUTE GROUPS. The signed-in area reads a session to
 * draw its frame; this page must not. It sits under the root layout alone,
 * like a survey's personal link, with its own small brand link home, and
 * reads from the first HTML that arrives. A link that opens nothing and a
 * form that has closed each get one calm sentence rendered here (never
 * `notFound()`, which answers with an empty body until the scripts arrive).
 * It sends no referrer anywhere and is kept out of search.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: FORM_WORDS.bar,
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function AnonymousFormPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const db = getAdminDb();
  const screen: FormScreen = db ? await formScreenFor(db, token, new Date()) : NO_FORM_SCREEN;

  return (
    <main className={styles.page}>
      <div className={styles.frame}>
        <div className={styles.bar}>
          <Link href="/" prefetch={false} className={styles.brand} aria-label="NAISI home">
            <BrandMark size={28} />
          </Link>
          <span className={styles.barTitle}>{FORM_WORDS.bar}</span>
          <span className={styles.barEnd} aria-hidden="true" />
        </div>
        <div className={styles.body}>
          <AnonymousFormScreen screen={screen} />
        </div>
      </div>
    </main>
  );
}

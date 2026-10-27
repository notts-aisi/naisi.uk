import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import BrandMark from "@/components/BrandMark";
import AnswerScreen from "@/features/surveys/answer/AnswerScreen";
import { getAdminDb } from "@/lib/firebase/admin";
import { getCurrentUser } from "@/lib/firebase/session";
import { CODE_PAGE_WORDS, codePageFor, type CodePage } from "@/lib/surveys/events/codePage";
import styles from "./survey.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: CODE_PAGE_WORDS.bar,
  robots: { index: false, follow: false },
};

/**
 * Where a survey's QR code lands at its event (sv-send, "At the event"):
 * signed in, somebody who signed up or came answers it; signed out, they are
 * asked to sign in, and a guest is told to use their emailed link
 * (`codePageFor` in `src/lib/surveys/events/codePage.ts` decides).
 *
 * A CODE SHOWN ON A SCREEN LANDS HERE, so this page is built like the
 * check-in page: it sits under the root layout alone, reads from its first
 * HTML, and never answers with `notFound()`. Every state is ordinary
 * server-rendered HTML. Opening it records nothing, and signed out it names
 * nobody.
 */
export default async function EventSurveyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getAdminDb();
  const page: CodePage =
    db && /^[A-Za-z0-9_-]{1,128}$/.test(id) ? await codePageFor(db, id, await getCurrentUser(), new Date()) : { kind: "none" };

  if (page.kind === "none") {
    return (
      <Frame>
        <h1 className={styles.title}>{CODE_PAGE_WORDS.none.title}</h1>
        <p className={styles.lead}>{CODE_PAGE_WORDS.none.body}</p>
      </Frame>
    );
  }
  if (page.kind === "sign-in") {
    return (
      <Frame line={page.line}>
        <h1 className={styles.title}>{page.title}</h1>
        <p className={styles.lead}>{CODE_PAGE_WORDS.signIn}</p>
        <Link href={`/login?next=${encodeURIComponent(page.next)}`} prefetch={false} className={styles.primary}>
          {CODE_PAGE_WORDS.signInButton}
        </Link>
        <p>{CODE_PAGE_WORDS.guest}</p>
      </Frame>
    );
  }
  if (page.kind === "message") {
    return (
      <Frame line={page.line}>
        <h1 className={styles.title}>{page.title}</h1>
        <p className={styles.lead}>{page.body}</p>
        {page.checkIn && (
          <p>
            <Link href={page.checkIn} prefetch={false} className={styles.textLink}>
              {CODE_PAGE_WORDS.checkIn}
            </Link>
          </p>
        )}
      </Frame>
    );
  }
  return (
    <Frame>
      <AnswerScreen screen={page.screen} />
    </Frame>
  );
}

function Frame({ line, children }: { line?: string; children: ReactNode }) {
  return (
    <main className={styles.page}>
      <div className={styles.frame}>
        <div className={styles.bar}>
          <Link href="/" prefetch={false} className={styles.brand} aria-label="NAISI home">
            <BrandMark size={28} />
          </Link>
          <span className={styles.barTitle}>{CODE_PAGE_WORDS.bar}</span>
          <span className={styles.barEnd} aria-hidden="true" />
        </div>
        <div className={styles.body}>
          {line && <p className={`meta ${styles.eventLine}`}>{line}</p>}
          {children}
        </div>
      </div>
    </main>
  );
}
